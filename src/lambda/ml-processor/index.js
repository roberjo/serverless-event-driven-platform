/**
 * ML Processor Lambda Function
 * 
 * This Lambda function specializes in processing Machine Learning (ML) events in the
 * Event-Driven Microservices Platform. It handles ML model inference requests,
 * integrates with Amazon Bedrock and SageMaker, manages feature stores, and provides
 * comprehensive ML workflow orchestration with model lifecycle management.
 * 
 * Key Responsibilities:
 * - ML event validation and schema enforcement
 * - Integration with Amazon Bedrock for foundation model inference
 * - Integration with Amazon SageMaker for custom model inference
 * - Feature store management and metadata tracking
 * - ML model lifecycle management and status tracking
 * - ML event queuing for downstream processing
 * - Notification publishing for ML events
 * - Comprehensive error handling and ML-specific logging
 * 
 * Supported Model Types:
 * - bedrock: Amazon Bedrock foundation models (text generation, analysis, etc.)
 * - sagemaker: Amazon SageMaker custom models and endpoints
 * - custom: Custom ML models and algorithms
 * 
 * @author Event-Driven Platform Team
 * @version 1.0.0
 * @since 2024-12-01
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// AWS SDK INITIALIZATION
// ============================================================================

/**
 * Initialize AWS SDK clients for various services
 * These clients are reused across function invocations for better performance
 */
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const sns = new AWS.SNS();
const sagemaker = new AWS.SageMaker();
const bedrock = new AWS.BedrockRuntime();

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Environment variables loaded from Lambda configuration
 * These should be set during infrastructure deployment
 */
const ML_MODELS_TABLE = process.env.ML_MODELS_TABLE;
const FEATURE_STORE_TABLE = process.env.FEATURE_STORE_TABLE;
const ML_QUEUE_URL = process.env.ML_QUEUE_URL;
const ML_PROCESSING_TOPIC_ARN = process.env.ML_PROCESSING_TOPIC_ARN;

// ============================================================================
// ML EVENT VALIDATION
// ============================================================================

/**
 * Validates the incoming ML event against the required schema
 * 
 * This function ensures that all required ML event fields are present and
 * have the correct data types before processing. ML events require specific
 * validation for model types and input data structures.
 * 
 * @param {Object} event - The ML event object to validate
 * @param {string} event.modelId - Unique identifier for the ML model
 * @param {string} event.modelType - Type of model ('bedrock', 'sagemaker', 'custom')
 * @param {Object} event.inputData - Input data for model inference
 * @param {string} [event.timestamp] - Optional ISO timestamp of when the event occurred
 * @param {string} [event.version] - Optional version of the model
 * @param {string} [event.correlationId] - Optional correlation ID for tracing
 * @param {Object} [event.metadata] - Optional additional metadata
 * 
 * @throws {Error} Throws error if validation fails with specific details
 * @returns {boolean} Returns true if validation passes
 * 
 * @example
 * const mlEvent = {
 *   modelId: 'anthropic.claude-v2',
 *   modelType: 'bedrock',
 *   inputData: { prompt: 'Hello, how are you?', maxTokens: 100 }
 * };
 * validateMLEventSchema(mlEvent); // Returns true or throws error
 */
const validateMLEventSchema = (event) => {
  console.log('🔍 Starting ML event schema validation', {
    modelId: event?.modelId,
    modelType: event?.modelType,
    hasInputData: !!event?.inputData,
    correlationId: event?.correlationId
  });

  // Check if event object exists
  if (!event || typeof event !== 'object') {
    const error = new Error('ML event must be a valid object');
    console.error('❌ ML event validation failed: Invalid event object', { error: error.message });
    throw error;
  }

  // Define required fields for ML events
  const requiredFields = ['modelId', 'inputData', 'modelType'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error('❌ ML event validation failed: Missing required fields', {
      missingFields,
      providedFields: Object.keys(event),
      error: error.message
    });
    throw error;
  }

  // Validate modelId
  if (!event.modelId || typeof event.modelId !== 'string') {
    const error = new Error('modelId must be a non-empty string');
    console.error('❌ ML event validation failed: Invalid modelId', {
      modelId: event.modelId,
      type: typeof event.modelId,
      error: error.message
    });
    throw error;
  }

  // Validate modelType
  if (!event.modelType || typeof event.modelType !== 'string') {
    const error = new Error('modelType must be a non-empty string');
    console.error('❌ ML event validation failed: Invalid modelType', {
      modelType: event.modelType,
      type: typeof event.modelType,
      error: error.message
    });
    throw error;
  }

  // Validate modelType values
  const validModelTypes = ['bedrock', 'sagemaker', 'custom'];
  if (!validModelTypes.includes(event.modelType)) {
    const error = new Error(`modelType must be one of: ${validModelTypes.join(', ')}`);
    console.error('❌ ML event validation failed: Invalid modelType value', {
      modelType: event.modelType,
      validTypes: validModelTypes,
      error: error.message
    });
    throw error;
  }

  // Validate inputData
  if (!event.inputData || typeof event.inputData !== 'object' || Array.isArray(event.inputData)) {
    const error = new Error('inputData must be a valid object (not null, undefined, or array)');
    console.error('❌ ML event validation failed: Invalid inputData', {
      inputData: event.inputData,
      type: typeof event.inputData,
      isArray: Array.isArray(event.inputData),
      error: error.message
    });
    throw error;
  }

  // Optional field validations
  if (event.version && typeof event.version !== 'string') {
    console.warn('⚠️ Optional field validation warning: version should be a string', {
      version: event.version,
      type: typeof event.version
    });
  }

  if (event.timestamp && typeof event.timestamp !== 'string') {
    console.warn('⚠️ Optional field validation warning: timestamp should be a string', {
      timestamp: event.timestamp,
      type: typeof event.timestamp
    });
  }

  console.log('✅ ML event schema validation passed', {
    modelId: event.modelId,
    modelType: event.modelType,
    inputDataKeys: Object.keys(event.inputData),
    correlationId: event.correlationId
  });

  return true;
};

// ============================================================================
// ML EVENT ENRICHMENT
// ============================================================================

/**
 * Enriches the ML event with additional metadata and processing context
 * 
 * This function adds essential metadata that is required for ML processing,
 * including model versioning, timestamps, and processing context. It ensures
 * all ML events have consistent structure for downstream processing.
 * 
 * @param {Object} event - The validated ML event object
 * @returns {Object} The enriched ML event with additional metadata
 * 
 * @example
 * const enrichedMLEvent = enrichMLEvent({
 *   modelId: 'anthropic.claude-v2',
 *   modelType: 'bedrock',
 *   inputData: { prompt: 'Hello' }
 * });
 * // Returns event with added timestamp, version, correlationId, etc.
 */
const enrichMLEvent = (event) => {
  console.log('🔧 Starting ML event enrichment', {
    originalModelId: event.modelId,
    modelType: event.modelType,
    hasInputData: !!event.inputData
  });

  const enrichedEvent = {
    // Core ML fields
    modelId: event.modelId,
    modelType: event.modelType,
    inputData: event.inputData,
    
    // Timestamps
    timestamp: event.timestamp || new Date().toISOString(),
    
    // Versioning
    version: event.version || '1.0',
    
    // Tracing and correlation
    correlationId: event.correlationId || uuidv4(),
    
    // Environment context
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    
    // Processing metadata
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'ml-processor-lambda',
      processorVersion: '1.0.0',
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID,
      mlContext: {
        hasCustomVersion: !!event.version,
        inputDataSize: JSON.stringify(event.inputData).length,
        ...event.metadata
      }
    }
  };

  console.log('✅ ML event enrichment completed', {
    modelId: enrichedEvent.modelId,
    modelType: enrichedEvent.modelType,
    version: enrichedEvent.version,
    correlationId: enrichedEvent.correlationId,
    timestamp: enrichedEvent.timestamp,
    environment: enrichedEvent.environment
  });

  return enrichedEvent;
};

// ============================================================================
// DYNAMODB STORAGE
// ============================================================================

/**
 * Stores the ML event in DynamoDB for persistent storage and tracking
 * 
 * This function saves the ML event to the ml_models table with appropriate
 * TTL for automatic cleanup. The event is stored with model-specific indexing
 * for efficient ML model lifecycle management.
 * 
 * @param {Object} event - The enriched ML event object to store
 * @returns {Promise<boolean>} Returns true if storage is successful
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await storeMLEvent(enrichedMLEvent);
 */
const storeMLEvent = async (event) => {
  console.log('💾 Starting ML event storage in DynamoDB', {
    modelId: event.modelId,
    modelType: event.modelType,
    tableName: ML_MODELS_TABLE,
    version: event.version
  });

  const params = {
    TableName: ML_MODELS_TABLE,
    Item: {
      // Composite primary key (modelId + version)
      modelId: event.modelId,
      version: event.version,
      
      // Core ML fields
      modelType: event.modelType,
      inputData: event.inputData,
      
      // Timestamps
      timestamp: event.timestamp,
      
      // Tracing and correlation
      correlationId: event.correlationId,
      
      // Environment context
      environment: event.environment,
      region: event.region,
      
      // Processing metadata
      metadata: event.metadata,
      
      // Processing status
      status: 'processing',
      
      // TTL for automatic cleanup (1 year from now - longer retention for ML models)
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.put(params).promise();
    const storageTime = Date.now() - startTime;
    
    console.log('✅ ML event stored successfully in DynamoDB', {
      modelId: event.modelId,
      modelType: event.modelType,
      tableName: ML_MODELS_TABLE,
      storageTime: `${storageTime}ms`,
      ttl: params.Item.ttl
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to store ML event in DynamoDB', {
      modelId: event.modelId,
      modelType: event.modelType,
      tableName: ML_MODELS_TABLE,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// ML MODEL PROCESSING
// ============================================================================

/**
 * Processes ML model based on model type with appropriate inference logic
 * 
 * This function routes ML events to the appropriate processing function
 * based on the model type. It supports Bedrock, SageMaker, and custom models
 * with specialized processing for each type.
 * 
 * @param {Object} event - The enriched ML event object to process
 * @returns {Promise<Object>} Returns the model inference result
 * @throws {Error} Throws error if processing fails
 * 
 * @example
 * const result = await processMLModel(enrichedMLEvent);
 */
const processMLModel = async (event) => {
  console.log('🤖 Starting ML model processing', {
    modelId: event.modelId,
    modelType: event.modelType,
    version: event.version
  });

  let result;
  switch (event.modelType) {
    case 'bedrock':
      console.log('🔮 Processing Bedrock model', { modelId: event.modelId });
      result = await processBedrockModel(event);
      break;
    case 'sagemaker':
      console.log('🧠 Processing SageMaker model', { modelId: event.modelId });
      result = await processSageMakerModel(event);
      break;
    case 'custom':
      console.log('⚙️ Processing custom model', { modelId: event.modelId });
      result = await processCustomModel(event);
      break;
    default:
      const error = new Error(`Unsupported model type: ${event.modelType}`);
      console.error('❌ Unsupported model type encountered', {
        modelId: event.modelId,
        modelType: event.modelType,
        error: error.message
      });
      throw error;
  }

  console.log('✅ ML model processing completed', {
    modelId: event.modelId,
    modelType: event.modelType,
    success: result.success
  });

  return result;
};

// ============================================================================
// MODEL TYPE PROCESSORS
// ============================================================================

/**
 * Processes Amazon Bedrock foundation model inference
 * 
 * This function handles inference requests to Amazon Bedrock foundation models,
 * including text generation, analysis, and other AI capabilities. It prepares
 * the request payload and handles the response processing.
 * 
 * @param {Object} event - The ML event object with Bedrock model details
 * @returns {Promise<Object>} Returns the Bedrock model inference result
 * @throws {Error} Throws error if Bedrock inference fails
 * 
 * @example
 * const result = await processBedrockModel({
 *   modelId: 'anthropic.claude-v2',
 *   inputData: { prompt: 'Hello, how are you?', maxTokens: 100 }
 * });
 */
const processBedrockModel = async (event) => {
  console.log('🔮 Starting Bedrock model processing', {
    modelId: event.modelId,
    inputDataSize: JSON.stringify(event.inputData).length
  });

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

    console.log('📤 Sending Bedrock inference request', {
      modelId: modelId,
      requestBody: requestBody
    });

    const params = {
      modelId: modelId,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json'
    };

    const startTime = Date.now();
    const response = await bedrock.invokeModel(params).promise();
    const inferenceTime = Date.now() - startTime;
    
    const result = JSON.parse(response.body.toString());

    console.log('✅ Bedrock model inference completed', {
      modelId: modelId,
      inferenceTime: `${inferenceTime}ms`,
      responseSize: response.body.length
    });

    return {
      success: true,
      output: result,
      modelType: 'bedrock',
      modelId: modelId,
      inferenceTime: inferenceTime
    };

  } catch (error) {
    console.error('❌ Failed to process Bedrock model', {
      modelId: event.modelId,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

/**
 * Processes Amazon SageMaker custom model inference
 * 
 * This function handles inference requests to Amazon SageMaker endpoints,
 * including custom trained models and algorithms. It invokes SageMaker
 * endpoints and processes the responses.
 * 
 * @param {Object} event - The ML event object with SageMaker model details
 * @returns {Promise<Object>} Returns the SageMaker model inference result
 * @throws {Error} Throws error if SageMaker inference fails
 * 
 * @example
 * const result = await processSageMakerModel({
 *   modelId: 'my-custom-model-endpoint',
 *   inputData: { features: [1, 2, 3, 4] }
 * });
 */
const processSageMakerModel = async (event) => {
  console.log('🧠 Starting SageMaker model processing', {
    modelId: event.modelId,
    inputDataSize: JSON.stringify(event.inputData).length
  });

  try {
    // Extract model parameters
    const { modelId, inputData } = event;
    
    // For SageMaker, we would typically invoke an endpoint
    // This is a simplified example - in practice, you'd use SageMaker Runtime
    const sagemakerRuntime = new AWS.SageMakerRuntime();
    
    console.log('📤 Sending SageMaker inference request', {
      endpointName: modelId,
      inputData: inputData
    });

    const params = {
      EndpointName: modelId,
      Body: JSON.stringify(inputData),
      ContentType: 'application/json'
    };

    const startTime = Date.now();
    const response = await sagemakerRuntime.invokeEndpoint(params).promise();
    const inferenceTime = Date.now() - startTime;
    
    const result = JSON.parse(response.Body.toString());

    console.log('✅ SageMaker model inference completed', {
      modelId: modelId,
      inferenceTime: `${inferenceTime}ms`,
      responseSize: response.Body.length
    });

    return {
      success: true,
      output: result,
      modelType: 'sagemaker',
      modelId: modelId,
      inferenceTime: inferenceTime
    };

  } catch (error) {
    console.error('❌ Failed to process SageMaker model', {
      modelId: event.modelId,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

/**
 * Processes custom ML model inference
 * 
 * This function handles custom ML model processing logic. In a production
 * environment, this would typically involve custom algorithms, external
 * API calls, or specialized model processing.
 * 
 * @param {Object} event - The ML event object with custom model details
 * @returns {Promise<Object>} Returns the custom model inference result
 * @throws {Error} Throws error if custom model processing fails
 * 
 * @example
 * const result = await processCustomModel({
 *   modelId: 'my-custom-algorithm',
 *   inputData: { data: [1, 2, 3, 4] }
 * });
 */
const processCustomModel = async (event) => {
  console.log('⚙️ Starting custom model processing', {
    modelId: event.modelId,
    inputDataSize: JSON.stringify(event.inputData).length
  });

  try {
    // Extract model parameters
    const { modelId, inputData } = event;
    
    // This would be your custom model processing logic
    // For now, we'll return a mock result
    console.log('🔧 Executing custom model logic', {
      modelId: modelId,
      inputData: inputData
    });

    const startTime = Date.now();
    
    // Simulate custom model processing
    const result = {
      prediction: Math.random(),
      confidence: 0.85,
      modelVersion: event.version,
      processingTime: Date.now() - startTime
    };

    console.log('✅ Custom model processing completed', {
      modelId: modelId,
      processingTime: `${result.processingTime}ms`,
      prediction: result.prediction,
      confidence: result.confidence
    });

    return {
      success: true,
      output: result,
      modelType: 'custom',
      modelId: modelId,
      processingTime: result.processingTime
    };

  } catch (error) {
    console.error('❌ Failed to process custom model', {
      modelId: event.modelId,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// FEATURE STORE MANAGEMENT
// ============================================================================

/**
 * Stores features in the feature store for ML model training and analysis
 * 
 * This function saves input features and output predictions to the feature
 * store table for future model training, analysis, and feature engineering.
 * 
 * @param {Object} event - The ML event object
 * @param {Object} result - The model inference result
 * @returns {Promise<boolean>} Returns true if storage is successful
 * @throws {Error} Throws error if feature storage fails
 * 
 * @example
 * await storeFeatures(enrichedMLEvent, inferenceResult);
 */
const storeFeatures = async (event, result) => {
  const featureKey = `${event.modelId}_${event.correlationId}`;
  
  console.log('💾 Starting feature storage', {
    featureKey: featureKey,
    modelId: event.modelId,
    modelType: event.modelType,
    tableName: FEATURE_STORE_TABLE
  });

  const params = {
    TableName: FEATURE_STORE_TABLE,
    Item: {
      // Primary key
      featureKey: featureKey,
      
      // Timestamps
      timestamp: event.timestamp,
      
      // Model context
      modelId: event.modelId,
      modelType: event.modelType,
      
      // Features
      inputFeatures: event.inputData,
      outputFeatures: result.output,
      
      // Tracing and correlation
      correlationId: event.correlationId,
      
      // Environment context
      environment: event.environment,
      region: event.region,
      
      // TTL for automatic cleanup (1 year from now)
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.put(params).promise();
    const storageTime = Date.now() - startTime;
    
    console.log('✅ Features stored successfully in feature store', {
      featureKey: featureKey,
      modelId: event.modelId,
      tableName: FEATURE_STORE_TABLE,
      storageTime: `${storageTime}ms`,
      ttl: params.Item.ttl
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to store features in feature store', {
      featureKey: featureKey,
      modelId: event.modelId,
      tableName: FEATURE_STORE_TABLE,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// MODEL STATUS MANAGEMENT
// ============================================================================

/**
 * Updates the status of an ML model in the database
 * 
 * This function updates the processing status of an ML model, including
 * processing, completed, or failed states. It can also store inference
 * results when the model completes successfully.
 * 
 * @param {Object} event - The ML event object
 * @param {string} status - The new status ('processing', 'completed', 'failed')
 * @param {Object} [result] - Optional inference result to store
 * @returns {Promise<void>} Returns when status update is complete
 * @throws {Error} Throws error if status update fails
 * 
 * @example
 * await updateModelStatus(enrichedMLEvent, 'completed', inferenceResult);
 */
const updateModelStatus = async (event, status, result = null) => {
  console.log('🔄 Starting model status update', {
    modelId: event.modelId,
    version: event.version,
    status: status,
    hasResult: !!result
  });

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
    const startTime = Date.now();
    await dynamodb.update(params).promise();
    const updateTime = Date.now() - startTime;
    
    console.log('✅ Model status updated successfully', {
      modelId: event.modelId,
      version: event.version,
      status: status,
      updateTime: `${updateTime}ms`
    });
  } catch (error) {
    console.error('❌ Failed to update model status', {
      modelId: event.modelId,
      version: event.version,
      status: status,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// SQS QUEUING
// ============================================================================

/**
 * Sends the ML event to SQS queue for asynchronous processing
 * 
 * This function queues the ML event for reliable asynchronous processing by
 * downstream ML services. SQS provides guaranteed message delivery and
 * automatic retry mechanisms for failed processing.
 * 
 * @param {Object} event - The enriched ML event object to queue
 * @returns {Promise<Object>} Returns SQS sendMessage result
 * @throws {Error} Throws error if SQS operation fails
 * 
 * @example
 * await sendToSQS(enrichedMLEvent);
 */
const sendToSQS = async (event) => {
  console.log('📬 Starting SQS ML event queuing', {
    modelId: event.modelId,
    modelType: event.modelType,
    queueUrl: ML_QUEUE_URL
  });

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
      'version': {
        DataType: 'String',
        StringValue: event.version
      },
      'correlationId': {
        DataType: 'String',
        StringValue: event.correlationId
      },
      'environment': {
        DataType: 'String',
        StringValue: event.environment
      }
    }
  };

  try {
    const startTime = Date.now();
    const result = await sqs.sendMessage(params).promise();
    const queuingTime = Date.now() - startTime;
    
    console.log('✅ ML event queued successfully in SQS', {
      modelId: event.modelId,
      modelType: event.modelType,
      queueUrl: ML_QUEUE_URL,
      messageId: result.MessageId,
      queuingTime: `${queuingTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to queue ML event in SQS', {
      modelId: event.modelId,
      modelType: event.modelType,
      queueUrl: ML_QUEUE_URL,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// SNS NOTIFICATIONS
// ============================================================================

/**
 * Sends notification about ML event processing status via SNS
 * 
 * This function publishes notifications to SNS topics for monitoring,
 * alerting, and integration with external systems. ML notifications
 * include model context and inference results.
 * 
 * @param {Object} event - The ML event object that was processed
 * @param {string} status - Processing status ('SUCCESS' or 'ERROR')
 * @param {Object} [result] - Optional inference result
 * @returns {Promise<Object|undefined>} Returns SNS publish result or undefined if no topic configured
 * 
 * @example
 * await sendNotification(enrichedMLEvent, 'SUCCESS', inferenceResult);
 */
const sendNotification = async (event, status, result = null) => {
  if (!ML_PROCESSING_TOPIC_ARN) {
    console.log('ℹ️ No ML processing topic configured, skipping notification', {
      modelId: event?.modelId,
      modelType: event?.modelType,
      status: status
    });
    return;
  }

  console.log('📢 Starting SNS ML notification', {
    modelId: event.modelId,
    modelType: event.modelType,
    topicArn: ML_PROCESSING_TOPIC_ARN,
    status: status
  });

  const message = {
    modelId: event.modelId,
    modelType: event.modelType,
    version: event.version,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    environment: event.environment,
    result: result,
    processingDetails: {
      processor: 'ml-processor-lambda',
      region: process.env.AWS_REGION,
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID
    }
  };

  const params = {
    TopicArn: ML_PROCESSING_TOPIC_ARN,
    Message: JSON.stringify(message, null, 2),
    Subject: `ML Processing: ${status} - ${event.modelType} (${event.modelId})`,
    MessageAttributes: {
      'modelType': {
        DataType: 'String',
        StringValue: event.modelType
      },
      'modelId': {
        DataType: 'String',
        StringValue: event.modelId
      },
      'version': {
        DataType: 'String',
        StringValue: event.version
      },
      'status': {
        DataType: 'String',
        StringValue: status
      },
      'environment': {
        DataType: 'String',
        StringValue: event.environment
      }
    }
  };

  try {
    const startTime = Date.now();
    const result = await sns.publish(params).promise();
    const notificationTime = Date.now() - startTime;
    
    console.log('✅ ML notification sent successfully via SNS', {
      modelId: event.modelId,
      modelType: event.modelType,
      topicArn: ML_PROCESSING_TOPIC_ARN,
      messageId: result.MessageId,
      status: status,
      notificationTime: `${notificationTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send ML notification via SNS', {
      modelId: event.modelId,
      modelType: event.modelType,
      topicArn: ML_PROCESSING_TOPIC_ARN,
      status: status,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    // Don't throw error for notification failures to avoid breaking main flow
  }
};

// ============================================================================
// MAIN LAMBDA HANDLER
// ============================================================================

/**
 * Main Lambda function handler for ML event processing
 * 
 * This is the entry point for the Lambda function. It orchestrates the entire
 * ML event processing workflow including validation, enrichment, storage,
 * model inference, feature storage, status updates, queuing, and notifications.
 * It provides comprehensive error handling and observability through structured
 * logging with ML-specific context.
 * 
 * @param {Object} event - Lambda event object (from SQS or direct invocation)
 * @param {Object} context - Lambda context object
 * @returns {Object} API Gateway response object with status code and body
 * 
 * @example
 * // SQS event
 * const response = await handler({
 *   Records: [{
 *     body: JSON.stringify({
 *       modelId: 'anthropic.claude-v2',
 *       modelType: 'bedrock',
 *       inputData: { prompt: 'Hello, how are you?' }
 *     })
 *   }]
 * }, context);
 */
exports.handler = async (event, context) => {
  // Initialize processing context
  const startTime = Date.now();
  const correlationId = uuidv4();
  const awsRequestId = context.awsRequestId;
  
  console.log('🚀 ML processor Lambda function started', {
    awsRequestId: awsRequestId,
    correlationId: correlationId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    eventSource: event.source,
    eventType: event['detail-type']
  });
  
  console.log('📥 Received ML event payload', {
    correlationId: correlationId,
    eventSize: JSON.stringify(event).length,
    hasRecords: !!event.Records,
    hasBody: !!event.body,
    recordCount: event.Records?.length || 0,
    eventKeys: Object.keys(event)
  });

  let eventData;
  let enrichedEvent;
  let processingResult = {
    success: false,
    modelId: null,
    modelType: null,
    correlationId: correlationId,
    processingTime: 0,
    steps: []
  };
  
  try {
    // Step 1: Extract event data from SQS or direct invocation
    console.log('🔍 Step 1: Extracting ML event data', { correlationId: correlationId });
    
    if (event.Records && event.Records[0].body) {
      // SQS event with message body
      try {
        eventData = JSON.parse(event.Records[0].body);
        console.log('✅ ML event data extracted from SQS record', {
          correlationId: correlationId,
          modelId: eventData.modelId,
          modelType: eventData.modelType,
          recordIndex: 0
        });
      } catch (parseError) {
        console.error('❌ Failed to parse SQS record body as JSON', {
          correlationId: correlationId,
          error: parseError.message,
          body: event.Records[0].body
        });
        throw new Error(`Invalid JSON in SQS record body: ${parseError.message}`);
      }
    } else if (event.body) {
      // API Gateway event with JSON body
      try {
        eventData = JSON.parse(event.body);
        console.log('✅ ML event data extracted from API Gateway body', {
          correlationId: correlationId,
          modelId: eventData.modelId,
          modelType: eventData.modelType
        });
      } catch (parseError) {
        console.error('❌ Failed to parse API Gateway body as JSON', {
          correlationId: correlationId,
          error: parseError.message,
          body: event.body
        });
        throw new Error(`Invalid JSON in request body: ${parseError.message}`);
      }
    } else {
      // Direct Lambda invocation
      eventData = event;
      console.log('✅ ML event data extracted from direct invocation', {
        correlationId: correlationId
      });
    }
    
    processingResult.steps.push('extract');
    
    // Step 2: Validate ML event schema
    console.log('🔍 Step 2: Validating ML event schema', { correlationId: correlationId });
    validateMLEventSchema(eventData);
    processingResult.steps.push('validate');
    
    // Step 3: Enrich ML event with metadata
    console.log('🔍 Step 3: Enriching ML event with metadata', { correlationId: correlationId });
    enrichedEvent = enrichMLEvent(eventData);
    enrichedEvent.correlationId = correlationId; // Ensure consistent correlation ID
    processingResult.modelId = enrichedEvent.modelId;
    processingResult.modelType = enrichedEvent.modelType;
    processingResult.steps.push('enrich');
    
    // Step 4: Store ML event in DynamoDB
    console.log('🔍 Step 4: Storing ML event in DynamoDB', { correlationId: correlationId });
    await storeMLEvent(enrichedEvent);
    processingResult.steps.push('store');
    
    // Step 5: Update model status to processing
    console.log('🔍 Step 5: Updating model status to processing', { correlationId: correlationId });
    await updateModelStatus(enrichedEvent, 'processing');
    processingResult.steps.push('status_update');
    
    // Step 6: Process ML model
    console.log('🔍 Step 6: Processing ML model', { correlationId: correlationId });
    const result = await processMLModel(enrichedEvent);
    processingResult.steps.push('inference');
    
    // Step 7: Store features in feature store
    console.log('🔍 Step 7: Storing features in feature store', { correlationId: correlationId });
    await storeFeatures(enrichedEvent, result);
    processingResult.steps.push('feature_store');
    
    // Step 8: Update model status to completed
    console.log('🔍 Step 8: Updating model status to completed', { correlationId: correlationId });
    await updateModelStatus(enrichedEvent, 'completed', result);
    processingResult.steps.push('status_complete');
    
    // Step 9: Send ML event to SQS queue
    console.log('🔍 Step 9: Queuing ML event in SQS', { correlationId: correlationId });
    await sendToSQS(enrichedEvent);
    processingResult.steps.push('queue');
    
    // Step 10: Send success notification
    console.log('🔍 Step 10: Sending success notification', { correlationId: correlationId });
    await sendNotification(enrichedEvent, 'SUCCESS', result);
    processingResult.steps.push('notify');
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    processingResult.success = true;
    
    console.log('🎉 ML processing completed successfully', {
      correlationId: correlationId,
      modelId: enrichedEvent.modelId,
      modelType: enrichedEvent.modelType,
      version: enrichedEvent.version,
      processingTime: `${processingTime}ms`,
      stepsCompleted: processingResult.steps.length,
      remainingTimeInMillis: context.getRemainingTimeInMillis()
    });
    
    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Model-ID': enrichedEvent.modelId,
        'X-Processing-Time': processingTime.toString()
      },
      body: JSON.stringify({
        success: true,
        modelId: enrichedEvent.modelId,
        modelType: enrichedEvent.modelType,
        version: enrichedEvent.version,
        result: result,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        message: 'ML model processed successfully',
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    
    console.error('💥 ML processing failed', {
      correlationId: correlationId,
      modelId: processingResult.modelId,
      modelType: processingResult.modelType,
      error: error.message,
      errorType: error.name,
      errorStack: error.stack,
      processingTime: `${processingTime}ms`,
      stepsCompleted: processingResult.steps,
      remainingTimeInMillis: context.getRemainingTimeInMillis()
    });
    
    // Update model status to failed if we have enriched event
    if (enrichedEvent) {
      try {
        console.log('🔄 Updating model status to failed', { correlationId: correlationId });
        await updateModelStatus(enrichedEvent, 'failed');
      } catch (statusError) {
        console.error('❌ Failed to update model status to failed', {
          correlationId: correlationId,
          error: statusError.message
        });
      }
    }
    
    // Send error notification if we have event data
    if (eventData) {
      try {
        console.log('📢 Sending error notification', { correlationId: correlationId });
        await sendNotification(eventData, 'ERROR');
      } catch (notificationError) {
        console.error('❌ Failed to send error notification', {
          correlationId: correlationId,
          error: notificationError.message
        });
      }
    }
    
    // Return error response
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Processing-Time': processingTime.toString()
      },
      body: JSON.stringify({
        success: false,
        modelId: processingResult.modelId,
        modelType: processingResult.modelType,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        error: error.message,
        errorType: error.name,
        message: 'ML model processing failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};
