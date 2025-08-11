/**
 * User Event Processor Lambda Function
 * 
 * This Lambda function specializes in processing user-specific events in the
 * Event-Driven Microservices Platform. It handles user interactions, behaviors,
 * and session data, providing user-centric event processing with enhanced
 * user context and session management.
 * 
 * Key Responsibilities:
 * - User event validation and schema enforcement
 * - User event enrichment with session and user context
 * - Persistent storage in user-specific DynamoDB table
 * - User event queuing for downstream user analytics
 * - User session management and tracking
 * - Notification publishing for user events
 * - Comprehensive error handling and user context logging
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

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Environment variables loaded from Lambda configuration
 * These should be set during infrastructure deployment
 */
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE;
const USER_EVENT_QUEUE_URL = process.env.USER_EVENT_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// ============================================================================
// USER EVENT VALIDATION
// ============================================================================

/**
 * Validates the incoming user event against the required schema
 * 
 * This function ensures that all required user event fields are present and
 * have the correct data types before processing. User events require additional
 * validation for user-specific fields like userId and sessionId.
 * 
 * @param {Object} event - The user event object to validate
 * @param {string} event.eventType - Type of user event (e.g., 'user.login', 'user.purchase')
 * @param {string} event.userId - Unique identifier for the user
 * @param {Object} event.data - User event payload containing the actual event data
 * @param {string} [event.eventId] - Optional unique identifier for the event
 * @param {string} [event.timestamp] - Optional ISO timestamp of when the event occurred
 * @param {string} [event.sessionId] - Optional session ID for user session tracking
 * @param {string} [event.correlationId] - Optional correlation ID for tracing
 * @param {Object} [event.metadata] - Optional additional metadata
 * 
 * @throws {Error} Throws error if validation fails with specific details
 * @returns {boolean} Returns true if validation passes
 * 
 * @example
 * const userEvent = {
 *   eventType: 'user.login',
 *   userId: 'user-123',
 *   data: { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0...' }
 * };
 * validateUserEventSchema(userEvent); // Returns true or throws error
 */
const validateUserEventSchema = (event) => {
  console.log('🔍 Starting user event schema validation', {
    eventType: event?.eventType,
    userId: event?.userId,
    hasData: !!event?.data,
    correlationId: event?.correlationId
  });

  // Check if event object exists
  if (!event || typeof event !== 'object') {
    const error = new Error('User event must be a valid object');
    console.error('❌ User event validation failed: Invalid event object', { error: error.message });
    throw error;
  }

  // Define required fields for user events
  const requiredFields = ['eventType', 'userId', 'data'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error('❌ User event validation failed: Missing required fields', {
      missingFields,
      providedFields: Object.keys(event),
      error: error.message
    });
    throw error;
  }

  // Validate userId (required for user events)
  if (!event.userId || typeof event.userId !== 'string') {
    const error = new Error('userId must be a non-empty string');
    console.error('❌ User event validation failed: Invalid userId', {
      userId: event.userId,
      type: typeof event.userId,
      error: error.message
    });
    throw error;
  }

  // Validate eventType
  if (!event.eventType || typeof event.eventType !== 'string') {
    const error = new Error('eventType must be a non-empty string');
    console.error('❌ User event validation failed: Invalid eventType', {
      eventType: event.eventType,
      type: typeof event.eventType,
      error: error.message
    });
    throw error;
  }

  // Validate data object
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    const error = new Error('data must be a valid object (not null, undefined, or array)');
    console.error('❌ User event validation failed: Invalid data object', {
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

  if (event.sessionId && typeof event.sessionId !== 'string') {
    console.warn('⚠️ Optional field validation warning: sessionId should be a string', {
      sessionId: event.sessionId,
      type: typeof event.sessionId
    });
  }

  if (event.timestamp && typeof event.timestamp !== 'string') {
    console.warn('⚠️ Optional field validation warning: timestamp should be a string', {
      timestamp: event.timestamp,
      type: typeof event.timestamp
    });
  }

  console.log('✅ User event schema validation passed', {
    eventType: event.eventType,
    userId: event.userId,
    dataKeys: Object.keys(event.data),
    correlationId: event.correlationId
  });

  return true;
};

// ============================================================================
// USER EVENT ENRICHMENT
// ============================================================================

/**
 * Enriches the user event with additional metadata and user-specific context
 * 
 * This function adds essential metadata that is required for user event processing,
 * including session management, user context, and enhanced tracing capabilities.
 * It ensures all user events have consistent structure with proper user context.
 * 
 * @param {Object} event - The validated user event object
 * @returns {Object} The enriched user event with additional metadata
 * 
 * @example
 * const enrichedUserEvent = enrichUserEvent({
 *   eventType: 'user.login',
 *   userId: 'user-123',
 *   data: { ipAddress: '192.168.1.1' }
 * });
 * // Returns event with added eventId, sessionId, timestamp, etc.
 */
const enrichUserEvent = (event) => {
  console.log('🔧 Starting user event enrichment', {
    originalEventId: event.eventId,
    userId: event.userId,
    eventType: event.eventType
  });

  const enrichedEvent = {
    // Preserve original eventId or generate new one
    eventId: event.eventId || uuidv4(),
    
    // User context (required for user events)
    userId: event.userId,
    
    // Core event fields
    eventType: event.eventType,
    
    // Timestamps
    timestamp: event.timestamp || new Date().toISOString(),
    
    // Session management
    sessionId: event.sessionId || uuidv4(),
    
    // Event payload
    data: event.data,
    
    // Tracing and correlation
    correlationId: event.correlationId || uuidv4(),
    
    // Environment context
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    
    // Processing metadata
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'user-event-processor-lambda',
      processorVersion: '1.0.0',
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID,
      userContext: {
        hasSessionId: !!event.sessionId,
        sessionGenerated: !event.sessionId,
        ...event.metadata
      }
    }
  };

  console.log('✅ User event enrichment completed', {
    eventId: enrichedEvent.eventId,
    userId: enrichedEvent.userId,
    sessionId: enrichedEvent.sessionId,
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
 * Stores the enriched user event in DynamoDB for persistent storage
 * 
 * This function saves the user event to the user_events table with appropriate
 * TTL for automatic cleanup. The event is stored with user-specific indexing
 * for efficient user-based queries and analytics.
 * 
 * @param {Object} event - The enriched user event object to store
 * @returns {Promise<boolean>} Returns true if storage is successful
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await storeUserEvent(enrichedUserEvent);
 */
const storeUserEvent = async (event) => {
  console.log('💾 Starting user event storage in DynamoDB', {
    eventId: event.eventId,
    userId: event.userId,
    tableName: USER_EVENTS_TABLE,
    eventType: event.eventType
  });

  const params = {
    TableName: USER_EVENTS_TABLE,
    Item: {
      // Composite primary key (userId + timestamp)
      userId: event.userId,
      timestamp: event.timestamp,
      
      // Event identification
      eventId: event.eventId,
      eventType: event.eventType,
      
      // Session management
      sessionId: event.sessionId,
      
      // Event payload
      data: event.data,
      
      // Tracing and correlation
      correlationId: event.correlationId,
      
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
    
    console.log('✅ User event stored successfully in DynamoDB', {
      eventId: event.eventId,
      userId: event.userId,
      tableName: USER_EVENTS_TABLE,
      storageTime: `${storageTime}ms`,
      ttl: params.Item.ttl
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to store user event in DynamoDB', {
      eventId: event.eventId,
      userId: event.userId,
      tableName: USER_EVENTS_TABLE,
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
 * Sends the user event to SQS queue for asynchronous processing
 * 
 * This function queues the user event for reliable asynchronous processing by
 * downstream user analytics services. SQS provides guaranteed message delivery
 * and automatic retry mechanisms for failed processing.
 * 
 * @param {Object} event - The enriched user event object to queue
 * @returns {Promise<Object>} Returns SQS sendMessage result
 * @throws {Error} Throws error if SQS operation fails
 * 
 * @example
 * await sendToSQS(enrichedUserEvent);
 */
const sendToSQS = async (event) => {
  console.log('📬 Starting SQS user event queuing', {
    eventId: event.eventId,
    userId: event.userId,
    queueUrl: USER_EVENT_QUEUE_URL,
    eventType: event.eventType
  });

  const params = {
    QueueUrl: USER_EVENT_QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageAttributes: {
      'eventType': {
        DataType: 'String',
        StringValue: event.eventType
      },
      'userId': {
        DataType: 'String',
        StringValue: event.userId
      },
      'sessionId': {
        DataType: 'String',
        StringValue: event.sessionId
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
    
    console.log('✅ User event queued successfully in SQS', {
      eventId: event.eventId,
      userId: event.userId,
      queueUrl: USER_EVENT_QUEUE_URL,
      messageId: result.MessageId,
      queuingTime: `${queuingTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to queue user event in SQS', {
      eventId: event.eventId,
      userId: event.userId,
      queueUrl: USER_EVENT_QUEUE_URL,
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
 * Sends notification about user event processing status via SNS
 * 
 * This function publishes notifications to SNS topics for monitoring,
 * alerting, and integration with external systems. User event notifications
 * include user context and session information.
 * 
 * @param {Object} event - The user event object that was processed
 * @param {string} status - Processing status ('SUCCESS' or 'ERROR')
 * @returns {Promise<Object|undefined>} Returns SNS publish result or undefined if no topic configured
 * 
 * @example
 * await sendNotification(enrichedUserEvent, 'SUCCESS');
 */
const sendNotification = async (event, status) => {
  if (!NOTIFICATION_TOPIC_ARN) {
    console.log('ℹ️ No notification topic configured, skipping notification', {
      eventId: event?.eventId,
      userId: event?.userId,
      status: status
    });
    return;
  }

  console.log('📢 Starting SNS user event notification', {
    eventId: event.eventId,
    userId: event.userId,
    topicArn: NOTIFICATION_TOPIC_ARN,
    status: status
  });

  const message = {
    eventId: event.eventId,
    userId: event.userId,
    eventType: event.eventType,
    sessionId: event.sessionId,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    environment: event.environment,
    processingDetails: {
      processor: 'user-event-processor-lambda',
      region: process.env.AWS_REGION,
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID
    }
  };

  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message, null, 2),
    Subject: `User Event Processing: ${status} - ${event.eventType} (User: ${event.userId})`,
    MessageAttributes: {
      'eventType': {
        DataType: 'String',
        StringValue: event.eventType
      },
      'userId': {
        DataType: 'String',
        StringValue: event.userId
      },
      'sessionId': {
        DataType: 'String',
        StringValue: event.sessionId
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
    
    console.log('✅ User event notification sent successfully via SNS', {
      eventId: event.eventId,
      userId: event.userId,
      topicArn: NOTIFICATION_TOPIC_ARN,
      messageId: result.MessageId,
      status: status,
      notificationTime: `${notificationTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send user event notification via SNS', {
      eventId: event.eventId,
      userId: event.userId,
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
 * Main Lambda function handler for user event processing
 * 
 * This is the entry point for the Lambda function. It orchestrates the entire
 * user event processing workflow including validation, enrichment, storage,
 * queuing, and notifications. It provides comprehensive error handling and
 * observability through structured logging with user context.
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
 *       eventType: 'user.login',
 *       userId: 'user-123',
 *       data: { ipAddress: '192.168.1.1' }
 *     })
 *   }]
 * }, context);
 */
exports.handler = async (event, context) => {
  // Initialize processing context
  const startTime = Date.now();
  const correlationId = uuidv4();
  const awsRequestId = context.awsRequestId;
  
  console.log('🚀 User event processor Lambda function started', {
    awsRequestId: awsRequestId,
    correlationId: correlationId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    eventSource: event.source,
    eventType: event['detail-type']
  });
  
  console.log('📥 Received user event payload', {
    correlationId: correlationId,
    eventSize: JSON.stringify(event).length,
    hasRecords: !!event.Records,
    hasBody: !!event.body,
    recordCount: event.Records?.length || 0,
    eventKeys: Object.keys(event)
  });

  let eventData;
  let processingResult = {
    success: false,
    eventId: null,
    userId: null,
    correlationId: correlationId,
    processingTime: 0,
    steps: []
  };
  
  try {
    // Step 1: Extract event data from SQS or direct invocation
    console.log('🔍 Step 1: Extracting user event data', { correlationId: correlationId });
    
    if (event.Records && event.Records[0].body) {
      // SQS event with message body
      try {
        eventData = JSON.parse(event.Records[0].body);
        console.log('✅ User event data extracted from SQS record', {
          correlationId: correlationId,
          eventType: eventData.eventType,
          userId: eventData.userId,
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
        console.log('✅ User event data extracted from API Gateway body', {
          correlationId: correlationId,
          eventType: eventData.eventType,
          userId: eventData.userId
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
      console.log('✅ User event data extracted from direct invocation', {
        correlationId: correlationId
      });
    }
    
    processingResult.steps.push('extract');
    
    // Step 2: Validate user event schema
    console.log('🔍 Step 2: Validating user event schema', { correlationId: correlationId });
    validateUserEventSchema(eventData);
    processingResult.steps.push('validate');
    
    // Step 3: Enrich user event with metadata
    console.log('🔍 Step 3: Enriching user event with metadata', { correlationId: correlationId });
    const enrichedEvent = enrichUserEvent(eventData);
    enrichedEvent.correlationId = correlationId; // Ensure consistent correlation ID
    processingResult.eventId = enrichedEvent.eventId;
    processingResult.userId = enrichedEvent.userId;
    processingResult.steps.push('enrich');
    
    // Step 4: Store user event in DynamoDB
    console.log('🔍 Step 4: Storing user event in DynamoDB', { correlationId: correlationId });
    await storeUserEvent(enrichedEvent);
    processingResult.steps.push('store');
    
    // Step 5: Send user event to SQS queue
    console.log('🔍 Step 5: Queuing user event in SQS', { correlationId: correlationId });
    await sendToSQS(enrichedEvent);
    processingResult.steps.push('queue');
    
    // Step 6: Send success notification
    console.log('🔍 Step 6: Sending success notification', { correlationId: correlationId });
    await sendNotification(enrichedEvent, 'SUCCESS');
    processingResult.steps.push('notify');
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    processingResult.success = true;
    
    console.log('🎉 User event processing completed successfully', {
      correlationId: correlationId,
      eventId: enrichedEvent.eventId,
      userId: enrichedEvent.userId,
      sessionId: enrichedEvent.sessionId,
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
        'X-User-ID': enrichedEvent.userId,
        'X-Processing-Time': processingTime.toString()
      },
      body: JSON.stringify({
        success: true,
        eventId: enrichedEvent.eventId,
        userId: enrichedEvent.userId,
        sessionId: enrichedEvent.sessionId,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        message: 'User event processed successfully',
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    
    console.error('💥 User event processing failed', {
      correlationId: correlationId,
      eventId: processingResult.eventId,
      userId: processingResult.userId,
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
        userId: processingResult.userId,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        error: error.message,
        errorType: error.name,
        message: 'User event processing failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};
