/**
 * Event Processor Lambda Function
 * 
 * This Lambda function serves as the primary entry point for event processing in the
 * Event-Driven Microservices Platform. It handles incoming events from API Gateway,
 * validates them, enriches them with metadata, stores them in DynamoDB, and routes
 * them to downstream services via EventBridge and SQS.
 * 
 * Key Responsibilities:
 * - Event validation and schema enforcement
 * - Event enrichment with metadata and correlation IDs
 * - Persistent storage in DynamoDB
 * - Event routing to EventBridge for real-time processing
 * - Event queuing in SQS for asynchronous processing
 * - Notification publishing via SNS
 * - Comprehensive error handling and logging
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
const eventbridge = new AWS.EventBridge();
const sqs = new AWS.SQS();
const sns = new AWS.SNS();

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Environment variables loaded from Lambda configuration
 * These should be set during infrastructure deployment
 */
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;
const EVENT_QUEUE_URL = process.env.EVENT_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// ============================================================================
// EVENT VALIDATION
// ============================================================================

/**
 * Validates the incoming event against the required schema
 * 
 * This function ensures that all required fields are present and have the correct
 * data types before processing. This is critical for data integrity and downstream
 * service compatibility.
 * 
 * @param {Object} event - The event object to validate
 * @param {string} event.eventType - Type/category of the event (e.g., 'user.login', 'order.created')
 * @param {string} event.eventSource - Source system that generated the event
 * @param {Object} event.data - Event payload containing the actual event data
 * @param {string} [event.eventId] - Optional unique identifier for the event
 * @param {string} [event.timestamp] - Optional ISO timestamp of when the event occurred
 * @param {string} [event.version] - Optional version of the event schema
 * @param {string} [event.correlationId] - Optional correlation ID for tracing
 * @param {string} [event.userId] - Optional user ID associated with the event
 * @param {string} [event.sessionId] - Optional session ID for user session tracking
 * @param {Object} [event.metadata] - Optional additional metadata
 * 
 * @throws {Error} Throws error if validation fails with specific details
 * @returns {boolean} Returns true if validation passes
 * 
 * @example
 * const event = {
 *   eventType: 'user.login',
 *   eventSource: 'web-application',
 *   data: { userId: '123', ipAddress: '192.168.1.1' }
 * };
 * validateEventSchema(event); // Returns true or throws error
 */
const validateEventSchema = (event) => {
  console.log('🔍 Starting event schema validation', {
    eventType: event?.eventType,
    eventSource: event?.eventSource,
    hasData: !!event?.data,
    correlationId: event?.correlationId
  });

  // Check if event object exists
  if (!event || typeof event !== 'object') {
    const error = new Error('Event must be a valid object');
    console.error('❌ Event validation failed: Invalid event object', { error: error.message });
    throw error;
  }

  // Define required fields and their expected types
  const requiredFields = ['eventType', 'eventSource', 'data'];
  const missingFields = requiredFields.filter(field => !event[field]);
  
  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error('❌ Event validation failed: Missing required fields', {
      missingFields,
      providedFields: Object.keys(event),
      error: error.message
    });
    throw error;
  }
  
  // Validate eventType
  if (!event.eventType || typeof event.eventType !== 'string') {
    const error = new Error('eventType must be a non-empty string');
    console.error('❌ Event validation failed: Invalid eventType', {
      eventType: event.eventType,
      type: typeof event.eventType,
      error: error.message
    });
    throw error;
  }

  // Validate eventSource
  if (!event.eventSource || typeof event.eventSource !== 'string') {
    const error = new Error('eventSource must be a non-empty string');
    console.error('❌ Event validation failed: Invalid eventSource', {
      eventSource: event.eventSource,
      type: typeof event.eventSource,
      error: error.message
    });
    throw error;
  }

  // Validate data object
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    const error = new Error('data must be a valid object (not null, undefined, or array)');
    console.error('❌ Event validation failed: Invalid data object', {
      data: event.data,
      type: typeof event.data,
      isArray: Array.isArray(event.data),
      error: error.message
    });
    throw error;
  }

  // Optional field validations
  if (event.eventId && typeof event.eventId !== 'string') {
    console.warn('⚠️ Optional field validation warning: eventId should be a string', {
      eventId: event.eventId,
      type: typeof event.eventId
    });
  }

  if (event.timestamp && typeof event.timestamp !== 'string') {
    console.warn('⚠️ Optional field validation warning: timestamp should be a string', {
      timestamp: event.timestamp,
      type: typeof event.timestamp
    });
  }

  console.log('✅ Event schema validation passed', {
    eventType: event.eventType,
    eventSource: event.eventSource,
    dataKeys: Object.keys(event.data),
    correlationId: event.correlationId
  });
  
  return true;
};

// ============================================================================
// EVENT ENRICHMENT
// ============================================================================

/**
 * Enriches the event with additional metadata and system-generated fields
 * 
 * This function adds essential metadata that is required for event processing,
 * tracing, and observability. It ensures all events have consistent structure
 * regardless of how they were originally created.
 * 
 * @param {Object} event - The validated event object
 * @returns {Object} The enriched event with additional metadata
 * 
 * @example
 * const enrichedEvent = enrichEvent({
 *   eventType: 'user.login',
 *   eventSource: 'web-application',
 *   data: { userId: '123' }
 * });
 * // Returns event with added eventId, timestamp, correlationId, etc.
 */
const enrichEvent = (event) => {
  console.log('🔧 Starting event enrichment', {
    originalEventId: event.eventId,
    eventType: event.eventType,
    eventSource: event.eventSource
  });

  const enrichedEvent = {
    // Preserve original eventId or generate new one
    eventId: event.eventId || uuidv4(),
    
    // Core event fields
    eventType: event.eventType,
    eventSource: event.eventSource,
    
    // Timestamps
    timestamp: event.timestamp || new Date().toISOString(),
    
    // Versioning
    version: event.version || '1.0',
    
    // Event payload
    data: event.data,
    
    // Tracing and correlation
    correlationId: event.correlationId || uuidv4(),
    
    // User context
    userId: event.userId || 'anonymous',
    sessionId: event.sessionId || uuidv4(),
    
    // Environment context
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    
    // Processing metadata
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'event-processor-lambda',
      processorVersion: '1.0.0',
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID,
      ...event.metadata
    }
  };

  console.log('✅ Event enrichment completed', {
    eventId: enrichedEvent.eventId,
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
 * Stores the enriched event in DynamoDB for persistent storage
 * 
 * This function saves the event to the events table with appropriate TTL
 * for automatic cleanup. The event is stored with its full metadata for
 * future retrieval and analysis.
 * 
 * @param {Object} event - The enriched event object to store
 * @returns {Promise<boolean>} Returns true if storage is successful
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await storeEvent(enrichedEvent);
 */
const storeEvent = async (event) => {
  console.log('💾 Starting event storage in DynamoDB', {
    eventId: event.eventId,
    tableName: EVENTS_TABLE,
    eventType: event.eventType
  });

  const params = {
    TableName: EVENTS_TABLE,
    Item: {
      // Primary key
      eventId: event.eventId,
      
      // Core event fields
      eventType: event.eventType,
      eventSource: event.eventSource,
      timestamp: event.timestamp,
      version: event.version,
      
      // Event payload
      data: event.data,
      
      // Tracing and correlation
      correlationId: event.correlationId,
      
      // User context
      userId: event.userId,
      sessionId: event.sessionId,
      
      // Environment context
      environment: event.environment,
      region: event.region,
      
      // Processing metadata
      metadata: event.metadata,
      
      // TTL for automatic cleanup (30 days from now)
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    }
  };
  
  try {
    const startTime = Date.now();
    await dynamodb.put(params).promise();
    const storageTime = Date.now() - startTime;
    
    console.log('✅ Event stored successfully in DynamoDB', {
      eventId: event.eventId,
      tableName: EVENTS_TABLE,
      storageTime: `${storageTime}ms`,
      ttl: params.Item.ttl
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to store event in DynamoDB', {
      eventId: event.eventId,
      tableName: EVENTS_TABLE,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// EVENTBRIDGE ROUTING
// ============================================================================

/**
 * Sends the event to EventBridge for real-time processing and routing
 * 
 * This function publishes the event to the custom event bus, allowing
 * other services to subscribe to specific event types and sources.
 * EventBridge provides real-time event routing with filtering capabilities.
 * 
 * @param {Object} event - The enriched event object to send
 * @returns {Promise<Object>} Returns EventBridge putEvents result
 * @throws {Error} Throws error if EventBridge operation fails
 * 
 * @example
 * await sendToEventBridge(enrichedEvent);
 */
const sendToEventBridge = async (event) => {
  console.log('🚀 Starting EventBridge event routing', {
    eventId: event.eventId,
    eventBusName: EVENT_BUS_NAME,
    eventType: event.eventType,
    eventSource: event.eventSource
  });

  const params = {
    Entries: [
      {
        Source: event.eventSource,
        DetailType: event.eventType,
        Detail: JSON.stringify(event),
        EventBusName: EVENT_BUS_NAME,
        Time: new Date()
      }
    ]
  };
  
  try {
    const startTime = Date.now();
    const result = await eventbridge.putEvents(params).promise();
    const routingTime = Date.now() - startTime;
    
    console.log('✅ Event routed successfully to EventBridge', {
      eventId: event.eventId,
      eventBusName: EVENT_BUS_NAME,
      routingTime: `${routingTime}ms`,
      failedEntryCount: result.FailedEntryCount,
      entries: result.Entries?.length || 0
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to route event to EventBridge', {
      eventId: event.eventId,
      eventBusName: EVENT_BUS_NAME,
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
 * Sends the event to SQS queue for asynchronous processing
 * 
 * This function queues the event for reliable asynchronous processing by
 * downstream services. SQS provides guaranteed message delivery and
 * automatic retry mechanisms for failed processing.
 * 
 * @param {Object} event - The enriched event object to queue
 * @returns {Promise<Object>} Returns SQS sendMessage result
 * @throws {Error} Throws error if SQS operation fails
 * 
 * @example
 * await sendToSQS(enrichedEvent);
 */
const sendToSQS = async (event) => {
  console.log('📬 Starting SQS event queuing', {
    eventId: event.eventId,
    queueUrl: EVENT_QUEUE_URL,
    eventType: event.eventType
  });

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
      },
      'userId': {
        DataType: 'String',
        StringValue: event.userId
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
    
    console.log('✅ Event queued successfully in SQS', {
      eventId: event.eventId,
      queueUrl: EVENT_QUEUE_URL,
      messageId: result.MessageId,
      queuingTime: `${queuingTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to queue event in SQS', {
      eventId: event.eventId,
      queueUrl: EVENT_QUEUE_URL,
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
 * Sends notification about event processing status via SNS
 * 
 * This function publishes notifications to SNS topics for monitoring,
 * alerting, and integration with external systems. Notifications include
 * processing status and key event metadata.
 * 
 * @param {Object} event - The event object that was processed
 * @param {string} status - Processing status ('SUCCESS' or 'ERROR')
 * @returns {Promise<Object|undefined>} Returns SNS publish result or undefined if no topic configured
 * 
 * @example
 * await sendNotification(enrichedEvent, 'SUCCESS');
 */
const sendNotification = async (event, status) => {
  if (!NOTIFICATION_TOPIC_ARN) {
    console.log('ℹ️ No notification topic configured, skipping notification', {
      eventId: event?.eventId,
      status: status
    });
    return;
  }
  
  console.log('📢 Starting SNS notification', {
    eventId: event.eventId,
    topicArn: NOTIFICATION_TOPIC_ARN,
    status: status
  });

  const message = {
    eventId: event.eventId,
    eventType: event.eventType,
    eventSource: event.eventSource,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    userId: event.userId,
    environment: event.environment,
    processingDetails: {
      processor: 'event-processor-lambda',
      region: process.env.AWS_REGION,
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID
    }
  };
  
  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message, null, 2),
    Subject: `Event Processing: ${status} - ${event.eventType}`,
    MessageAttributes: {
      'eventType': {
        DataType: 'String',
        StringValue: event.eventType
      },
      'eventSource': {
        DataType: 'String',
        StringValue: event.eventSource
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
    
    console.log('✅ Notification sent successfully via SNS', {
      eventId: event.eventId,
      topicArn: NOTIFICATION_TOPIC_ARN,
      messageId: result.MessageId,
      status: status,
      notificationTime: `${notificationTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send notification via SNS', {
      eventId: event.eventId,
      topicArn: NOTIFICATION_TOPIC_ARN,
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
 * Main Lambda function handler for event processing
 * 
 * This is the entry point for the Lambda function. It orchestrates the entire
 * event processing workflow including validation, enrichment, storage, routing,
 * queuing, and notifications. It provides comprehensive error handling and
 * observability through structured logging.
 * 
 * @param {Object} event - Lambda event object (from API Gateway or direct invocation)
 * @param {Object} context - Lambda context object
 * @returns {Object} API Gateway response object with status code and body
 * 
 * @example
 * // API Gateway event
 * const response = await handler({
 *   body: JSON.stringify({
 *     eventType: 'user.login',
 *     eventSource: 'web-application',
 *     data: { userId: '123' }
 *   })
 * }, context);
 */
exports.handler = async (event, context) => {
  // Initialize processing context
  const startTime = Date.now();
  const correlationId = uuidv4();
  const awsRequestId = context.awsRequestId;
  
  console.log('🚀 Event processor Lambda function started', {
    awsRequestId: awsRequestId,
    correlationId: correlationId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    eventSource: event.source,
    eventType: event['detail-type']
  });
  
  console.log('📥 Received event payload', {
    correlationId: correlationId,
    eventSize: JSON.stringify(event).length,
    hasBody: !!event.body,
    hasRecords: !!event.Records,
    eventKeys: Object.keys(event)
  });

  let eventData;
  let processingResult = {
    success: false,
    eventId: null,
    correlationId: correlationId,
    processingTime: 0,
    steps: []
  };
  
  try {
    // Step 1: Extract event data from API Gateway or direct invocation
    console.log('🔍 Step 1: Extracting event data', { correlationId: correlationId });
    
    if (event.body) {
      // API Gateway event with JSON body
      try {
        eventData = JSON.parse(event.body);
        console.log('✅ Event data extracted from API Gateway body', {
          correlationId: correlationId,
          eventType: eventData.eventType,
          eventSource: eventData.eventSource
        });
      } catch (parseError) {
        console.error('❌ Failed to parse API Gateway body as JSON', {
          correlationId: correlationId,
          error: parseError.message,
          body: event.body
        });
        throw new Error(`Invalid JSON in request body: ${parseError.message}`);
      }
    } else if (event.Records) {
      // SQS or other AWS service event
      eventData = event;
      console.log('✅ Event data extracted from AWS service event', {
        correlationId: correlationId,
        recordCount: event.Records.length
      });
    } else {
      // Direct Lambda invocation
      eventData = event;
      console.log('✅ Event data extracted from direct invocation', {
        correlationId: correlationId
      });
    }
    
    processingResult.steps.push('extract');
    
    // Step 2: Validate event schema
    console.log('🔍 Step 2: Validating event schema', { correlationId: correlationId });
    validateEventSchema(eventData);
    processingResult.steps.push('validate');
    
    // Step 3: Enrich event with metadata
    console.log('🔍 Step 3: Enriching event with metadata', { correlationId: correlationId });
    const enrichedEvent = enrichEvent(eventData);
    enrichedEvent.correlationId = correlationId; // Ensure consistent correlation ID
    processingResult.eventId = enrichedEvent.eventId;
    processingResult.steps.push('enrich');
    
    // Step 4: Store event in DynamoDB
    console.log('🔍 Step 4: Storing event in DynamoDB', { correlationId: correlationId });
    await storeEvent(enrichedEvent);
    processingResult.steps.push('store');
    
    // Step 5: Send event to EventBridge
    console.log('🔍 Step 5: Routing event to EventBridge', { correlationId: correlationId });
    await sendToEventBridge(enrichedEvent);
    processingResult.steps.push('route');
    
    // Step 6: Send event to SQS queue
    console.log('🔍 Step 6: Queuing event in SQS', { correlationId: correlationId });
    await sendToSQS(enrichedEvent);
    processingResult.steps.push('queue');
    
    // Step 7: Send success notification
    console.log('🔍 Step 7: Sending success notification', { correlationId: correlationId });
    await sendNotification(enrichedEvent, 'SUCCESS');
    processingResult.steps.push('notify');
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    processingResult.success = true;
    
    console.log('🎉 Event processing completed successfully', {
      correlationId: correlationId,
      eventId: enrichedEvent.eventId,
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
        'X-Event-ID': enrichedEvent.eventId,
        'X-Processing-Time': processingTime.toString()
      },
      body: JSON.stringify({
        success: true,
        eventId: enrichedEvent.eventId,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        message: 'Event processed successfully',
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    
    console.error('💥 Event processing failed', {
      correlationId: correlationId,
      eventId: processingResult.eventId,
      error: error.message,
      errorType: error.name,
      errorStack: error.stack,
      processingTime: `${processingTime}ms`,
      stepsCompleted: processingResult.steps,
      remainingTimeInMillis: context.getRemainingTimeInMillis()
    });
    
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
        eventId: processingResult.eventId,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        error: error.message,
        errorType: error.name,
        message: 'Event processing failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};
