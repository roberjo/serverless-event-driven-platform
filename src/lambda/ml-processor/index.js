const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS SDK
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const sns = new AWS.SNS();
const sagemaker = new AWS.SageMaker();
const bedrock = new AWS.BedrockRuntime();

// Environment variables
const ML_MODELS_TABLE = process.env.ML_MODELS_TABLE;
const FEATURE_STORE_TABLE = process.env.FEATURE_STORE_TABLE;
const ML_QUEUE_URL = process.env.ML_QUEUE_URL;
const ML_PROCESSING_TOPIC_ARN = process.env.ML_PROCESSING_TOPIC_ARN;

// ML event schema validation
const validateMLEventSchema = (event) => {
  const requiredFields = ['modelId', 'inputData', 'modelType'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  if (!event.modelId || typeof event.modelId !== 'string') {
    throw new Error('modelId must be a string');
  }

  if (!event.modelType || typeof event.modelType !== 'string') {
    throw new Error('modelType must be a string');
  }

  if (!event.inputData || typeof event.inputData !== 'object') {
    throw new Error('inputData must be an object');
  }

  return true;
};

// Enrich ML event with metadata
const enrichMLEvent = (event) => {
  return {
    modelId: event.modelId,
    modelType: event.modelType,
    inputData: event.inputData,
    timestamp: event.timestamp || new Date().toISOString(),
    version: event.version || '1.0',
    correlationId: event.correlationId || uuidv4(),
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'ml-processor-lambda',
      ...event.metadata
    }
  };
};

// Store ML event in DynamoDB
const storeMLEvent = async (event) => {
  const params = {
    TableName: ML_MODELS_TABLE,
    Item: {
      modelId: event.modelId,
      version: event.version,
      modelType: event.modelType,
      inputData: event.inputData,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
      environment: event.environment,
      region: event.region,
      metadata: event.metadata,
      status: 'processing',
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    }
  };

  try {
    await dynamodb.put(params).promise();
    console.log(`ML event stored in DynamoDB: ${event.modelId}`);
    return true;
  } catch (error) {
    console.error('Error storing ML event in DynamoDB:', error);
    throw error;
  }
};

// Process ML model based on type
const processMLModel = async (event) => {
  switch (event.modelType) {
    case 'bedrock':
      return await processBedrockModel(event);
    case 'sagemaker':
      return await processSageMakerModel(event);
    case 'custom':
      return await processCustomModel(event);
    default:
      throw new Error(`Unsupported model type: ${event.modelType}`);
  }
};

// Process Bedrock model
const processBedrockModel = async (event) => {
  try {
    // Extract model parameters
    const { modelId, inputData } = event;
    
    // Prepare request for Bedrock
    const requestBody = {
      prompt: inputData.prompt || '',
      max_tokens: inputData.maxTokens || 100,
      temperature: inputData.temperature || 0.7,
      top_p: inputData.topP || 1.0
    };

    const params = {
      modelId: modelId,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json'
    };

    const response = await bedrock.invokeModel(params).promise();
    const result = JSON.parse(response.body.toString());

    return {
      success: true,
      output: result,
      modelType: 'bedrock',
      modelId: modelId
    };

  } catch (error) {
    console.error('Error processing Bedrock model:', error);
    throw error;
  }
};

// Process SageMaker model
const processSageMakerModel = async (event) => {
  try {
    // Extract model parameters
    const { modelId, inputData } = event;
    
    // For SageMaker, we would typically invoke an endpoint
    // This is a simplified example - in practice, you'd use SageMaker Runtime
    const sagemakerRuntime = new AWS.SageMakerRuntime();
    
    const params = {
      EndpointName: modelId,
      Body: JSON.stringify(inputData),
      ContentType: 'application/json'
    };

    const response = await sagemakerRuntime.invokeEndpoint(params).promise();
    const result = JSON.parse(response.Body.toString());

    return {
      success: true,
      output: result,
      modelType: 'sagemaker',
      modelId: modelId
    };

  } catch (error) {
    console.error('Error processing SageMaker model:', error);
    throw error;
  }
};

// Process custom model
const processCustomModel = async (event) => {
  try {
    // Extract model parameters
    const { modelId, inputData } = event;
    
    // This would be your custom model processing logic
    // For now, we'll return a mock result
    const result = {
      prediction: Math.random(),
      confidence: 0.85,
      modelVersion: event.version
    };

    return {
      success: true,
      output: result,
      modelType: 'custom',
      modelId: modelId
    };

  } catch (error) {
    console.error('Error processing custom model:', error);
    throw error;
  }
};

// Store features in feature store
const storeFeatures = async (event, result) => {
  const featureKey = `${event.modelId}_${event.correlationId}`;
  
  const params = {
    TableName: FEATURE_STORE_TABLE,
    Item: {
      featureKey: featureKey,
      timestamp: event.timestamp,
      modelId: event.modelId,
      modelType: event.modelType,
      inputFeatures: event.inputData,
      outputFeatures: result.output,
      correlationId: event.correlationId,
      environment: event.environment,
      region: event.region,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    }
  };

  try {
    await dynamodb.put(params).promise();
    console.log(`Features stored in feature store: ${featureKey}`);
    return true;
  } catch (error) {
    console.error('Error storing features:', error);
    throw error;
  }
};

// Update model status
const updateModelStatus = async (event, status, result = null) => {
  const params = {
    TableName: ML_MODELS_TABLE,
    Key: {
      modelId: event.modelId,
      version: event.version
    },
    UpdateExpression: 'SET #status = :status, #lastUpdate = :lastUpdate',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#lastUpdate': 'lastUpdate'
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':lastUpdate': new Date().toISOString()
    }
  };

  if (result) {
    params.UpdateExpression += ', #result = :result';
    params.ExpressionAttributeNames['#result'] = 'result';
    params.ExpressionAttributeValues[':result'] = result;
  }

  try {
    await dynamodb.update(params).promise();
    console.log(`Model status updated: ${event.modelId} -> ${status}`);
  } catch (error) {
    console.error('Error updating model status:', error);
    throw error;
  }
};

// Send ML event to SQS queue
const sendToSQS = async (event) => {
  const params = {
    QueueUrl: ML_QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageAttributes: {
      'modelType': {
        DataType: 'String',
        StringValue: event.modelType
      },
      'modelId': {
        DataType: 'String',
        StringValue: event.modelId
      },
      'correlationId': {
        DataType: 'String',
        StringValue: event.correlationId
      }
    }
  };

  try {
    const result = await sqs.sendMessage(params).promise();
    console.log(`ML event sent to SQS: ${event.modelId}`);
    return result;
  } catch (error) {
    console.error('Error sending ML event to SQS:', error);
    throw error;
  }
};

// Send notification
const sendNotification = async (event, status, result = null) => {
  if (!ML_PROCESSING_TOPIC_ARN) {
    console.log('No ML processing topic configured, skipping notification');
    return;
  }

  const message = {
    modelId: event.modelId,
    modelType: event.modelType,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    result: result
  };

  const params = {
    TopicArn: ML_PROCESSING_TOPIC_ARN,
    Message: JSON.stringify(message),
    Subject: `ML Processing: ${status}`,
    MessageAttributes: {
      'modelType': {
        DataType: 'String',
        StringValue: event.modelType
      },
      'status': {
        DataType: 'String',
        StringValue: status
      }
    }
  };

  try {
    const result = await sns.publish(params).promise();
    console.log(`ML notification sent: ${event.modelId}`);
    return result;
  } catch (error) {
    console.error('Error sending ML notification:', error);
    // Don't throw error for notification failures
  }
};

// Main handler function
exports.handler = async (event, context) => {
  console.log('ML processor started');
  console.log('Event:', JSON.stringify(event, null, 2));

  const startTime = Date.now();
  const correlationId = uuidv4();

  try {
    // Extract event from SQS or direct invocation
    let eventData;
    if (event.Records && event.Records[0].body) {
      eventData = JSON.parse(event.Records[0].body);
    } else if (event.body) {
      eventData = JSON.parse(event.body);
    } else {
      eventData = event;
    }

    // Validate ML event schema
    validateMLEventSchema(eventData);

    // Enrich ML event with metadata
    const enrichedEvent = enrichMLEvent(eventData);
    enrichedEvent.correlationId = correlationId;

    // Store ML event in DynamoDB
    await storeMLEvent(enrichedEvent);

    // Update model status to processing
    await updateModelStatus(enrichedEvent, 'processing');

    // Process ML model
    const result = await processMLModel(enrichedEvent);

    // Store features in feature store
    await storeFeatures(enrichedEvent, result);

    // Update model status to completed
    await updateModelStatus(enrichedEvent, 'completed', result);

    // Send ML event to SQS queue for further processing
    await sendToSQS(enrichedEvent);

    // Send success notification
    await sendNotification(enrichedEvent, 'SUCCESS', result);

    const processingTime = Date.now() - startTime;
    console.log(`ML processing completed successfully in ${processingTime}ms`);

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        success: true,
        modelId: enrichedEvent.modelId,
        modelType: enrichedEvent.modelType,
        result: result,
        correlationId: correlationId,
        processingTime: processingTime,
        message: 'ML model processed successfully'
      })
    };

  } catch (error) {
    console.error('Error processing ML event:', error);

    // Update model status to failed
    if (enrichedEvent) {
      await updateModelStatus(enrichedEvent, 'failed');
    }

    // Send error notification
    if (eventData) {
      await sendNotification(eventData, 'ERROR');
    }

    const processingTime = Date.now() - startTime;

    // Return error response
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        success: false,
        correlationId: correlationId,
        processingTime: processingTime,
        error: error.message,
        message: 'ML model processing failed'
      })
    };
  }
};
