const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS SDK
const dynamodb = new AWS.DynamoDB.DocumentClient();
const eventbridge = new AWS.EventBridge();
const sqs = new AWS.SQS();
const sns = new AWS.SNS();

// Environment variables
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;
const EVENT_QUEUE_URL = process.env.EVENT_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// Event schema validation
const validateEventSchema = (event) => {
  const requiredFields = ['eventType', 'eventSource', 'data'];
  const missingFields = requiredFields.filter(field => !event[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  if (!event.eventType || typeof event.eventType !== 'string') {
    throw new Error('eventType must be a string');
  }
  
  if (!event.eventSource || typeof event.eventSource !== 'string') {
    throw new Error('eventSource must be a string');
  }
  
  if (!event.data || typeof event.data !== 'object') {
    throw new Error('data must be an object');
  }
  
  return true;
};

// Enrich event with metadata
const enrichEvent = (event) => {
  return {
    eventId: event.eventId || uuidv4(),
    eventType: event.eventType,
    eventSource: event.eventSource,
    timestamp: event.timestamp || new Date().toISOString(),
    version: event.version || '1.0',
    data: event.data,
    correlationId: event.correlationId || uuidv4(),
    userId: event.userId || 'anonymous',
    sessionId: event.sessionId || uuidv4(),
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'event-processor-lambda',
      ...event.metadata
    }
  };
};

// Store event in DynamoDB
const storeEvent = async (event) => {
  const params = {
    TableName: EVENTS_TABLE,
    Item: {
      eventId: event.eventId,
      eventType: event.eventType,
      eventSource: event.eventSource,
      timestamp: event.timestamp,
      version: event.version,
      data: event.data,
      correlationId: event.correlationId,
      userId: event.userId,
      sessionId: event.sessionId,
      environment: event.environment,
      region: event.region,
      metadata: event.metadata,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    }
  };
  
  try {
    await dynamodb.put(params).promise();
    console.log(`Event stored in DynamoDB: ${event.eventId}`);
    return true;
  } catch (error) {
    console.error('Error storing event in DynamoDB:', error);
    throw error;
  }
};

// Send event to EventBridge
const sendToEventBridge = async (event) => {
  const params = {
    Entries: [
      {
        Source: event.eventSource,
        DetailType: event.eventType,
        Detail: JSON.stringify(event),
        EventBusName: EVENT_BUS_NAME
      }
    ]
  };
  
  try {
    const result = await eventbridge.putEvents(params).promise();
    console.log(`Event sent to EventBridge: ${event.eventId}`);
    return result;
  } catch (error) {
    console.error('Error sending event to EventBridge:', error);
    throw error;
  }
};

// Send event to SQS queue
const sendToSQS = async (event) => {
  const params = {
    QueueUrl: EVENT_QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageAttributes: {
      'eventType': {
        DataType: 'String',
        StringValue: event.eventType
      },
      'eventSource': {
        DataType: 'String',
        StringValue: event.eventSource
      },
      'correlationId': {
        DataType: 'String',
        StringValue: event.correlationId
      }
    }
  };
  
  try {
    const result = await sqs.sendMessage(params).promise();
    console.log(`Event sent to SQS: ${event.eventId}`);
    return result;
  } catch (error) {
    console.error('Error sending event to SQS:', error);
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
    eventId: event.eventId,
    eventType: event.eventType,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId
  };
  
  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message),
    Subject: `Event Processing: ${status}`,
    MessageAttributes: {
      'eventType': {
        DataType: 'String',
        StringValue: event.eventType
      },
      'status': {
        DataType: 'String',
        StringValue: status
      }
    }
  };
  
  try {
    const result = await sns.publish(params).promise();
    console.log(`Notification sent: ${event.eventId}`);
    return result;
  } catch (error) {
    console.error('Error sending notification:', error);
    // Don't throw error for notification failures
  }
};

// Main handler function
exports.handler = async (event, context) => {
  console.log('Event processor started');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  const correlationId = uuidv4();
  
  try {
    // Extract event from API Gateway
    let eventData;
    if (event.body) {
      eventData = JSON.parse(event.body);
    } else {
      eventData = event;
    }
    
    // Validate event schema
    validateEventSchema(eventData);
    
    // Enrich event with metadata
    const enrichedEvent = enrichEvent(eventData);
    enrichedEvent.correlationId = correlationId;
    
    // Store event in DynamoDB
    await storeEvent(enrichedEvent);
    
    // Send event to EventBridge
    await sendToEventBridge(enrichedEvent);
    
    // Send event to SQS queue
    await sendToSQS(enrichedEvent);
    
    // Send success notification
    await sendNotification(enrichedEvent, 'SUCCESS');
    
    const processingTime = Date.now() - startTime;
    console.log(`Event processing completed successfully in ${processingTime}ms`);
    
    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        success: true,
        eventId: enrichedEvent.eventId,
        correlationId: correlationId,
        processingTime: processingTime,
        message: 'Event processed successfully'
      })
    };
    
  } catch (error) {
    console.error('Error processing event:', error);
    
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
        message: 'Event processing failed'
      })
    };
  }
};
