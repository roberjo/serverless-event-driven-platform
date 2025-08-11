const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS SDK
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const sns = new AWS.SNS();

// Environment variables
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const ANALYTICS_QUEUE_URL = process.env.ANALYTICS_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// Analytics event schema validation
const validateAnalyticsEventSchema = (event) => {
  const requiredFields = ['metricKey', 'metricType', 'value'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  if (!event.metricKey || typeof event.metricKey !== 'string') {
    throw new Error('metricKey must be a string');
  }

  if (!event.metricType || typeof event.metricType !== 'string') {
    throw new Error('metricType must be a string');
  }

  if (event.value === undefined || event.value === null) {
    throw new Error('value must be provided');
  }

  return true;
};

// Enrich analytics event with metadata
const enrichAnalyticsEvent = (event) => {
  return {
    metricKey: event.metricKey,
    timestamp: event.timestamp || new Date().toISOString(),
    metricType: event.metricType,
    value: event.value,
    unit: event.unit || 'count',
    dimensions: event.dimensions || {},
    correlationId: event.correlationId || uuidv4(),
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'analytics-processor-lambda',
      ...event.metadata
    }
  };
};

// Store analytics event in DynamoDB
const storeAnalyticsEvent = async (event) => {
  const params = {
    TableName: ANALYTICS_TABLE,
    Item: {
      metricKey: event.metricKey,
      timestamp: event.timestamp,
      metricType: event.metricType,
      value: event.value,
      unit: event.unit,
      dimensions: event.dimensions,
      correlationId: event.correlationId,
      environment: event.environment,
      region: event.region,
      metadata: event.metadata,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    }
  };

  try {
    await dynamodb.put(params).promise();
    console.log(`Analytics event stored in DynamoDB: ${event.metricKey}`);
    return true;
  } catch (error) {
    console.error('Error storing analytics event in DynamoDB:', error);
    throw error;
  }
};

// Process analytics data
const processAnalyticsData = async (event) => {
  // Calculate aggregations based on metric type
  switch (event.metricType) {
    case 'counter':
      // Increment counter
      await incrementCounter(event);
      break;
    case 'gauge':
      // Update gauge value
      await updateGauge(event);
      break;
    case 'histogram':
      // Add to histogram
      await addToHistogram(event);
      break;
    case 'summary':
      // Update summary statistics
      await updateSummary(event);
      break;
    default:
      console.log(`Unknown metric type: ${event.metricType}`);
  }
};

// Increment counter
const incrementCounter = async (event) => {
  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_counter`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #value = if_not_exists(#value, :zero) + :increment',
    ExpressionAttributeNames: {
      '#value': 'value'
    },
    ExpressionAttributeValues: {
      ':zero': 0,
      ':increment': event.value
    }
  };

  try {
    await dynamodb.update(params).promise();
    console.log(`Counter incremented: ${event.metricKey}`);
  } catch (error) {
    console.error('Error incrementing counter:', error);
    throw error;
  }
};

// Update gauge
const updateGauge = async (event) => {
  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_gauge`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #value = :value, #lastUpdate = :lastUpdate',
    ExpressionAttributeNames: {
      '#value': 'value',
      '#lastUpdate': 'lastUpdate'
    },
    ExpressionAttributeValues: {
      ':value': event.value,
      ':lastUpdate': new Date().toISOString()
    }
  };

  try {
    await dynamodb.update(params).promise();
    console.log(`Gauge updated: ${event.metricKey}`);
  } catch (error) {
    console.error('Error updating gauge:', error);
    throw error;
  }
};

// Add to histogram
const addToHistogram = async (event) => {
  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_histogram`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #values = list_append(if_not_exists(#values, :empty_list), :value)',
    ExpressionAttributeNames: {
      '#values': 'values'
    },
    ExpressionAttributeValues: {
      ':empty_list': [],
      ':value': [event.value]
    }
  };

  try {
    await dynamodb.update(params).promise();
    console.log(`Histogram updated: ${event.metricKey}`);
  } catch (error) {
    console.error('Error updating histogram:', error);
    throw error;
  }
};

// Update summary statistics
const updateSummary = async (event) => {
  // This would typically involve more complex statistical calculations
  // For now, we'll just store the raw value
  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_summary`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #values = list_append(if_not_exists(#values, :empty_list), :value)',
    ExpressionAttributeNames: {
      '#values': 'values'
    },
    ExpressionAttributeValues: {
      ':empty_list': [],
      ':value': [event.value]
    }
  };

  try {
    await dynamodb.update(params).promise();
    console.log(`Summary updated: ${event.metricKey}`);
  } catch (error) {
    console.error('Error updating summary:', error);
    throw error;
  }
};

// Send analytics event to SQS queue
const sendToSQS = async (event) => {
  const params = {
    QueueUrl: ANALYTICS_QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageAttributes: {
      'metricType': {
        DataType: 'String',
        StringValue: event.metricType
      },
      'metricKey': {
        DataType: 'String',
        StringValue: event.metricKey
      },
      'correlationId': {
        DataType: 'String',
        StringValue: event.correlationId
      }
    }
  };

  try {
    const result = await sqs.sendMessage(params).promise();
    console.log(`Analytics event sent to SQS: ${event.metricKey}`);
    return result;
  } catch (error) {
    console.error('Error sending analytics event to SQS:', error);
    throw error;
  }
};

// Send notification
const sendNotification = async (event, status) => {
  if (!NOTIFICATION_TOPIC_ARN) {
    console.log('No notification topic configured, skipping notification');
    return;
  }

  const message = {
    metricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId
  };

  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message),
    Subject: `Analytics Processing: ${status}`,
    MessageAttributes: {
      'metricType': {
        DataType: 'String',
        StringValue: event.metricType
      },
      'status': {
        DataType: 'String',
        StringValue: status
      }
    }
  };

  try {
    const result = await sns.publish(params).promise();
    console.log(`Analytics notification sent: ${event.metricKey}`);
    return result;
  } catch (error) {
    console.error('Error sending analytics notification:', error);
    // Don't throw error for notification failures
  }
};

// Main handler function
exports.handler = async (event, context) => {
  console.log('Analytics processor started');
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

    // Validate analytics event schema
    validateAnalyticsEventSchema(eventData);

    // Enrich analytics event with metadata
    const enrichedEvent = enrichAnalyticsEvent(eventData);
    enrichedEvent.correlationId = correlationId;

    // Store analytics event in DynamoDB
    await storeAnalyticsEvent(enrichedEvent);

    // Process analytics data
    await processAnalyticsData(enrichedEvent);

    // Send analytics event to SQS queue for further processing
    await sendToSQS(enrichedEvent);

    // Send success notification
    await sendNotification(enrichedEvent, 'SUCCESS');

    const processingTime = Date.now() - startTime;
    console.log(`Analytics processing completed successfully in ${processingTime}ms`);

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        success: true,
        metricKey: enrichedEvent.metricKey,
        correlationId: correlationId,
        processingTime: processingTime,
        message: 'Analytics event processed successfully'
      })
    };

  } catch (error) {
    console.error('Error processing analytics event:', error);

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
        message: 'Analytics event processing failed'
      })
    };
  }
};
