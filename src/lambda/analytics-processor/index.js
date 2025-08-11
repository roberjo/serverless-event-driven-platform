/**
 * Analytics Processor Lambda Function
 * 
 * This Lambda function specializes in processing analytics and metrics events in the
 * Event-Driven Microservices Platform. It handles various types of metrics including
 * counters, gauges, histograms, and summaries, providing real-time analytics processing
 * with aggregation capabilities and statistical analysis.
 * 
 * Key Responsibilities:
 * - Analytics event validation and schema enforcement
 * - Metrics processing with different aggregation types (counter, gauge, histogram, summary)
 * - Real-time statistical calculations and aggregations
 * - Persistent storage in analytics-specific DynamoDB table
 * - Analytics event queuing for downstream processing
 * - Notification publishing for analytics events
 * - Comprehensive error handling and metrics logging
 * 
 * Supported Metric Types:
 * - counter: Incremental counters (e.g., page views, API calls)
 * - gauge: Current values (e.g., active users, memory usage)
 * - histogram: Distribution of values (e.g., response times, request sizes)
 * - summary: Statistical summaries (e.g., averages, percentiles)
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
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const ANALYTICS_QUEUE_URL = process.env.ANALYTICS_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// ============================================================================
// ANALYTICS EVENT VALIDATION
// ============================================================================

/**
 * Validates the incoming analytics event against the required schema
 * 
 * This function ensures that all required analytics fields are present and
 * have the correct data types before processing. Analytics events require
 * specific validation for metric types and values.
 * 
 * @param {Object} event - The analytics event object to validate
 * @param {string} event.metricKey - Unique identifier for the metric (e.g., 'api.calls', 'user.active')
 * @param {string} event.metricType - Type of metric ('counter', 'gauge', 'histogram', 'summary')
 * @param {number|string} event.value - The metric value to be processed
 * @param {string} [event.timestamp] - Optional ISO timestamp of when the metric was recorded
 * @param {string} [event.unit] - Optional unit of measurement (e.g., 'count', 'ms', 'bytes')
 * @param {Object} [event.dimensions] - Optional key-value pairs for metric dimensions
 * @param {string} [event.correlationId] - Optional correlation ID for tracing
 * @param {Object} [event.metadata] - Optional additional metadata
 * 
 * @throws {Error} Throws error if validation fails with specific details
 * @returns {boolean} Returns true if validation passes
 * 
 * @example
 * const analyticsEvent = {
 *   metricKey: 'api.response_time',
 *   metricType: 'histogram',
 *   value: 150,
 *   unit: 'ms',
 *   dimensions: { endpoint: '/users', method: 'GET' }
 * };
 * validateAnalyticsEventSchema(analyticsEvent); // Returns true or throws error
 */
const validateAnalyticsEventSchema = (event) => {
  console.log('🔍 Starting analytics event schema validation', {
    metricKey: event?.metricKey,
    metricType: event?.metricType,
    value: event?.value,
    correlationId: event?.correlationId
  });

  // Check if event object exists
  if (!event || typeof event !== 'object') {
    const error = new Error('Analytics event must be a valid object');
    console.error('❌ Analytics event validation failed: Invalid event object', { error: error.message });
    throw error;
  }

  // Define required fields for analytics events
  const requiredFields = ['metricKey', 'metricType', 'value'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error('❌ Analytics event validation failed: Missing required fields', {
      missingFields,
      providedFields: Object.keys(event),
      error: error.message
    });
    throw error;
  }

  // Validate metricKey
  if (!event.metricKey || typeof event.metricKey !== 'string') {
    const error = new Error('metricKey must be a non-empty string');
    console.error('❌ Analytics event validation failed: Invalid metricKey', {
      metricKey: event.metricKey,
      type: typeof event.metricKey,
      error: error.message
    });
    throw error;
  }

  // Validate metricType
  if (!event.metricType || typeof event.metricType !== 'string') {
    const error = new Error('metricType must be a non-empty string');
    console.error('❌ Analytics event validation failed: Invalid metricType', {
      metricType: event.metricType,
      type: typeof event.metricType,
      error: error.message
    });
    throw error;
  }

  // Validate metricType values
  const validMetricTypes = ['counter', 'gauge', 'histogram', 'summary'];
  if (!validMetricTypes.includes(event.metricType)) {
    const error = new Error(`metricType must be one of: ${validMetricTypes.join(', ')}`);
    console.error('❌ Analytics event validation failed: Invalid metricType value', {
      metricType: event.metricType,
      validTypes: validMetricTypes,
      error: error.message
    });
    throw error;
  }

  // Validate value
  if (event.value === undefined || event.value === null) {
    const error = new Error('value must be provided and cannot be null or undefined');
    console.error('❌ Analytics event validation failed: Missing value', {
      value: event.value,
      error: error.message
    });
    throw error;
  }

  // Validate value type based on metric type
  if (event.metricType === 'counter' || event.metricType === 'gauge') {
    if (typeof event.value !== 'number' || isNaN(event.value)) {
      const error = new Error('value must be a valid number for counter and gauge metrics');
      console.error('❌ Analytics event validation failed: Invalid value type for metric type', {
        value: event.value,
        type: typeof event.value,
        metricType: event.metricType,
        error: error.message
      });
      throw error;
    }
  }

  // Optional field validations
  if (event.unit && typeof event.unit !== 'string') {
    console.warn('⚠️ Optional field validation warning: unit should be a string', {
      unit: event.unit,
      type: typeof event.unit
    });
  }

  if (event.dimensions && (typeof event.dimensions !== 'object' || Array.isArray(event.dimensions))) {
    console.warn('⚠️ Optional field validation warning: dimensions should be an object', {
      dimensions: event.dimensions,
      type: typeof event.dimensions
    });
  }

  if (event.timestamp && typeof event.timestamp !== 'string') {
    console.warn('⚠️ Optional field validation warning: timestamp should be a string', {
      timestamp: event.timestamp,
      type: typeof event.timestamp
    });
  }

  console.log('✅ Analytics event schema validation passed', {
    metricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value,
    unit: event.unit,
    dimensions: event.dimensions,
    correlationId: event.correlationId
  });

  return true;
};

// ============================================================================
// ANALYTICS EVENT ENRICHMENT
// ============================================================================

/**
 * Enriches the analytics event with additional metadata and processing context
 * 
 * This function adds essential metadata that is required for analytics processing,
 * including timestamps, units, dimensions, and processing context. It ensures
 * all analytics events have consistent structure for downstream processing.
 * 
 * @param {Object} event - The validated analytics event object
 * @returns {Object} The enriched analytics event with additional metadata
 * 
 * @example
 * const enrichedAnalyticsEvent = enrichAnalyticsEvent({
 *   metricKey: 'api.calls',
 *   metricType: 'counter',
 *   value: 1
 * });
 * // Returns event with added timestamp, unit, dimensions, etc.
 */
const enrichAnalyticsEvent = (event) => {
  console.log('🔧 Starting analytics event enrichment', {
    originalMetricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value
  });

  const enrichedEvent = {
    // Core metric fields
    metricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value,
    
    // Timestamps
    timestamp: event.timestamp || new Date().toISOString(),
    
    // Units and dimensions
    unit: event.unit || 'count',
    dimensions: event.dimensions || {},
    
    // Tracing and correlation
    correlationId: event.correlationId || uuidv4(),
    
    // Environment context
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    
    // Processing metadata
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'analytics-processor-lambda',
      processorVersion: '1.0.0',
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID,
      analyticsContext: {
        hasDimensions: Object.keys(event.dimensions || {}).length > 0,
        hasCustomUnit: !!event.unit,
        ...event.metadata
      }
    }
  };

  console.log('✅ Analytics event enrichment completed', {
    metricKey: enrichedEvent.metricKey,
    metricType: enrichedEvent.metricType,
    value: enrichedEvent.value,
    unit: enrichedEvent.unit,
    dimensions: enrichedEvent.dimensions,
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
 * Stores the enriched analytics event in DynamoDB for persistent storage
 * 
 * This function saves the analytics event to the analytics table with appropriate
 * TTL for automatic cleanup. The event is stored with metric-specific indexing
 * for efficient analytics queries and aggregations.
 * 
 * @param {Object} event - The enriched analytics event object to store
 * @returns {Promise<boolean>} Returns true if storage is successful
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await storeAnalyticsEvent(enrichedAnalyticsEvent);
 */
const storeAnalyticsEvent = async (event) => {
  console.log('💾 Starting analytics event storage in DynamoDB', {
    metricKey: event.metricKey,
    metricType: event.metricType,
    tableName: ANALYTICS_TABLE,
    value: event.value
  });

  const params = {
    TableName: ANALYTICS_TABLE,
    Item: {
      // Composite primary key (metricKey + timestamp)
      metricKey: event.metricKey,
      timestamp: event.timestamp,
      
      // Core metric fields
      metricType: event.metricType,
      value: event.value,
      
      // Units and dimensions
      unit: event.unit,
      dimensions: event.dimensions,
      
      // Tracing and correlation
      correlationId: event.correlationId,
      
      // Environment context
      environment: event.environment,
      region: event.region,
      
      // Processing metadata
      metadata: event.metadata,
      
      // TTL for automatic cleanup (90 days from now - longer retention for analytics)
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.put(params).promise();
    const storageTime = Date.now() - startTime;
    
    console.log('✅ Analytics event stored successfully in DynamoDB', {
      metricKey: event.metricKey,
      metricType: event.metricType,
      tableName: ANALYTICS_TABLE,
      storageTime: `${storageTime}ms`,
      ttl: params.Item.ttl
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to store analytics event in DynamoDB', {
      metricKey: event.metricKey,
      metricType: event.metricType,
      tableName: ANALYTICS_TABLE,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

// ============================================================================
// ANALYTICS DATA PROCESSING
// ============================================================================

/**
 * Processes analytics data based on metric type with appropriate aggregations
 * 
 * This function handles different types of metrics with specialized processing
 * logic for each type. It performs real-time aggregations and statistical
 * calculations as needed.
 * 
 * @param {Object} event - The enriched analytics event object to process
 * @returns {Promise<void>} Returns when processing is complete
 * @throws {Error} Throws error if processing fails
 * 
 * @example
 * await processAnalyticsData(enrichedAnalyticsEvent);
 */
const processAnalyticsData = async (event) => {
  console.log('📊 Starting analytics data processing', {
    metricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value
  });

  // Calculate aggregations based on metric type
  switch (event.metricType) {
    case 'counter':
      console.log('🔢 Processing counter metric', { metricKey: event.metricKey, value: event.value });
      await incrementCounter(event);
      break;
    case 'gauge':
      console.log('📈 Processing gauge metric', { metricKey: event.metricKey, value: event.value });
      await updateGauge(event);
      break;
    case 'histogram':
      console.log('📊 Processing histogram metric', { metricKey: event.metricKey, value: event.value });
      await addToHistogram(event);
      break;
    case 'summary':
      console.log('📋 Processing summary metric', { metricKey: event.metricKey, value: event.value });
      await updateSummary(event);
      break;
    default:
      console.warn('⚠️ Unknown metric type encountered', {
        metricKey: event.metricKey,
        metricType: event.metricType,
        value: event.value
      });
  }

  console.log('✅ Analytics data processing completed', {
    metricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value
  });
};

// ============================================================================
// METRIC TYPE PROCESSORS
// ============================================================================

/**
 * Increments a counter metric in DynamoDB
 * 
 * This function atomically increments a counter value using DynamoDB's
 * conditional update expressions. It handles the case where the counter
 * doesn't exist by initializing it to zero first.
 * 
 * @param {Object} event - The analytics event object
 * @returns {Promise<void>} Returns when counter is incremented
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await incrementCounter({ metricKey: 'api.calls', value: 1 });
 */
const incrementCounter = async (event) => {
  console.log('🔢 Starting counter increment', {
    metricKey: event.metricKey,
    value: event.value,
    tableName: ANALYTICS_TABLE
  });

  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_counter`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #value = if_not_exists(#value, :zero) + :increment, #lastUpdate = :lastUpdate',
    ExpressionAttributeNames: {
      '#value': 'value',
      '#lastUpdate': 'lastUpdate'
    },
    ExpressionAttributeValues: {
      ':zero': 0,
      ':increment': event.value,
      ':lastUpdate': new Date().toISOString()
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.update(params).promise();
    const updateTime = Date.now() - startTime;
    
    console.log('✅ Counter incremented successfully', {
      metricKey: event.metricKey,
      value: event.value,
      updateTime: `${updateTime}ms`
    });
  } catch (error) {
    console.error('❌ Failed to increment counter', {
      metricKey: event.metricKey,
      value: event.value,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

/**
 * Updates a gauge metric in DynamoDB
 * 
 * This function updates a gauge value with the latest reading. Gauges
 * represent current values rather than cumulative counts.
 * 
 * @param {Object} event - The analytics event object
 * @returns {Promise<void>} Returns when gauge is updated
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await updateGauge({ metricKey: 'active.users', value: 150 });
 */
const updateGauge = async (event) => {
  console.log('📈 Starting gauge update', {
    metricKey: event.metricKey,
    value: event.value,
    tableName: ANALYTICS_TABLE
  });

  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_gauge`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #value = :value, #lastUpdate = :lastUpdate, #unit = :unit',
    ExpressionAttributeNames: {
      '#value': 'value',
      '#lastUpdate': 'lastUpdate',
      '#unit': 'unit'
    },
    ExpressionAttributeValues: {
      ':value': event.value,
      ':lastUpdate': new Date().toISOString(),
      ':unit': event.unit
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.update(params).promise();
    const updateTime = Date.now() - startTime;
    
    console.log('✅ Gauge updated successfully', {
      metricKey: event.metricKey,
      value: event.value,
      unit: event.unit,
      updateTime: `${updateTime}ms`
    });
  } catch (error) {
    console.error('❌ Failed to update gauge', {
      metricKey: event.metricKey,
      value: event.value,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

/**
 * Adds a value to a histogram metric in DynamoDB
 * 
 * This function appends a value to a histogram's list of values for
 * distribution analysis. Histograms track the frequency distribution
 * of values over time.
 * 
 * @param {Object} event - The analytics event object
 * @returns {Promise<void>} Returns when histogram is updated
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await addToHistogram({ metricKey: 'response.time', value: 150 });
 */
const addToHistogram = async (event) => {
  console.log('📊 Starting histogram update', {
    metricKey: event.metricKey,
    value: event.value,
    tableName: ANALYTICS_TABLE
  });

  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_histogram`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #values = list_append(if_not_exists(#values, :empty_list), :value), #lastUpdate = :lastUpdate',
    ExpressionAttributeNames: {
      '#values': 'values',
      '#lastUpdate': 'lastUpdate'
    },
    ExpressionAttributeValues: {
      ':empty_list': [],
      ':value': [event.value],
      ':lastUpdate': new Date().toISOString()
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.update(params).promise();
    const updateTime = Date.now() - startTime;
    
    console.log('✅ Histogram updated successfully', {
      metricKey: event.metricKey,
      value: event.value,
      updateTime: `${updateTime}ms`
    });
  } catch (error) {
    console.error('❌ Failed to update histogram', {
      metricKey: event.metricKey,
      value: event.value,
      error: error.message,
      errorCode: error.code,
      errorType: error.name
    });
    throw error;
  }
};

/**
 * Updates summary statistics in DynamoDB
 * 
 * This function maintains summary statistics by collecting values for
 * statistical analysis. In a production environment, this would typically
 * involve more complex statistical calculations.
 * 
 * @param {Object} event - The analytics event object
 * @returns {Promise<void>} Returns when summary is updated
 * @throws {Error} Throws error if DynamoDB operation fails
 * 
 * @example
 * await updateSummary({ metricKey: 'error.rate', value: 0.05 });
 */
const updateSummary = async (event) => {
  console.log('📋 Starting summary update', {
    metricKey: event.metricKey,
    value: event.value,
    tableName: ANALYTICS_TABLE
  });

  // This would typically involve more complex statistical calculations
  // For now, we'll just store the raw value for later analysis
  const params = {
    TableName: ANALYTICS_TABLE,
    Key: {
      metricKey: `${event.metricKey}_summary`,
      timestamp: event.timestamp
    },
    UpdateExpression: 'SET #values = list_append(if_not_exists(#values, :empty_list), :value), #lastUpdate = :lastUpdate',
    ExpressionAttributeNames: {
      '#values': 'values',
      '#lastUpdate': 'lastUpdate'
    },
    ExpressionAttributeValues: {
      ':empty_list': [],
      ':value': [event.value],
      ':lastUpdate': new Date().toISOString()
    }
  };

  try {
    const startTime = Date.now();
    await dynamodb.update(params).promise();
    const updateTime = Date.now() - startTime;
    
    console.log('✅ Summary updated successfully', {
      metricKey: event.metricKey,
      value: event.value,
      updateTime: `${updateTime}ms`
    });
  } catch (error) {
    console.error('❌ Failed to update summary', {
      metricKey: event.metricKey,
      value: event.value,
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
 * Sends the analytics event to SQS queue for asynchronous processing
 * 
 * This function queues the analytics event for reliable asynchronous processing by
 * downstream analytics services. SQS provides guaranteed message delivery and
 * automatic retry mechanisms for failed processing.
 * 
 * @param {Object} event - The enriched analytics event object to queue
 * @returns {Promise<Object>} Returns SQS sendMessage result
 * @throws {Error} Throws error if SQS operation fails
 * 
 * @example
 * await sendToSQS(enrichedAnalyticsEvent);
 */
const sendToSQS = async (event) => {
  console.log('📬 Starting SQS analytics event queuing', {
    metricKey: event.metricKey,
    metricType: event.metricType,
    queueUrl: ANALYTICS_QUEUE_URL,
    value: event.value
  });

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
      'unit': {
        DataType: 'String',
        StringValue: event.unit
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
    
    console.log('✅ Analytics event queued successfully in SQS', {
      metricKey: event.metricKey,
      metricType: event.metricType,
      queueUrl: ANALYTICS_QUEUE_URL,
      messageId: result.MessageId,
      queuingTime: `${queuingTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to queue analytics event in SQS', {
      metricKey: event.metricKey,
      metricType: event.metricType,
      queueUrl: ANALYTICS_QUEUE_URL,
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
 * Sends notification about analytics event processing status via SNS
 * 
 * This function publishes notifications to SNS topics for monitoring,
 * alerting, and integration with external systems. Analytics notifications
 * include metric context and processing details.
 * 
 * @param {Object} event - The analytics event object that was processed
 * @param {string} status - Processing status ('SUCCESS' or 'ERROR')
 * @returns {Promise<Object|undefined>} Returns SNS publish result or undefined if no topic configured
 * 
 * @example
 * await sendNotification(enrichedAnalyticsEvent, 'SUCCESS');
 */
const sendNotification = async (event, status) => {
  if (!NOTIFICATION_TOPIC_ARN) {
    console.log('ℹ️ No notification topic configured, skipping notification', {
      metricKey: event?.metricKey,
      metricType: event?.metricType,
      status: status
    });
    return;
  }

  console.log('📢 Starting SNS analytics notification', {
    metricKey: event.metricKey,
    metricType: event.metricType,
    topicArn: NOTIFICATION_TOPIC_ARN,
    status: status
  });

  const message = {
    metricKey: event.metricKey,
    metricType: event.metricType,
    value: event.value,
    unit: event.unit,
    dimensions: event.dimensions,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    environment: event.environment,
    processingDetails: {
      processor: 'analytics-processor-lambda',
      region: process.env.AWS_REGION,
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID
    }
  };

  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message, null, 2),
    Subject: `Analytics Processing: ${status} - ${event.metricType} (${event.metricKey})`,
    MessageAttributes: {
      'metricType': {
        DataType: 'String',
        StringValue: event.metricType
      },
      'metricKey': {
        DataType: 'String',
        StringValue: event.metricKey
      },
      'unit': {
        DataType: 'String',
        StringValue: event.unit
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
    
    console.log('✅ Analytics notification sent successfully via SNS', {
      metricKey: event.metricKey,
      metricType: event.metricType,
      topicArn: NOTIFICATION_TOPIC_ARN,
      messageId: result.MessageId,
      status: status,
      notificationTime: `${notificationTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send analytics notification via SNS', {
      metricKey: event.metricKey,
      metricType: event.metricType,
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
 * Main Lambda function handler for analytics event processing
 * 
 * This is the entry point for the Lambda function. It orchestrates the entire
 * analytics event processing workflow including validation, enrichment, storage,
 * processing, queuing, and notifications. It provides comprehensive error handling
 * and observability through structured logging with metrics context.
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
 *       metricKey: 'api.calls',
 *       metricType: 'counter',
 *       value: 1
 *     })
 *   }]
 * }, context);
 */
exports.handler = async (event, context) => {
  // Initialize processing context
  const startTime = Date.now();
  const correlationId = uuidv4();
  const awsRequestId = context.awsRequestId;
  
  console.log('🚀 Analytics processor Lambda function started', {
    awsRequestId: awsRequestId,
    correlationId: correlationId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    eventSource: event.source,
    eventType: event['detail-type']
  });
  
  console.log('📥 Received analytics event payload', {
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
    metricKey: null,
    metricType: null,
    correlationId: correlationId,
    processingTime: 0,
    steps: []
  };
  
  try {
    // Step 1: Extract event data from SQS or direct invocation
    console.log('🔍 Step 1: Extracting analytics event data', { correlationId: correlationId });
    
    if (event.Records && event.Records[0].body) {
      // SQS event with message body
      try {
        eventData = JSON.parse(event.Records[0].body);
        console.log('✅ Analytics event data extracted from SQS record', {
          correlationId: correlationId,
          metricKey: eventData.metricKey,
          metricType: eventData.metricType,
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
        console.log('✅ Analytics event data extracted from API Gateway body', {
          correlationId: correlationId,
          metricKey: eventData.metricKey,
          metricType: eventData.metricType
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
      console.log('✅ Analytics event data extracted from direct invocation', {
        correlationId: correlationId
      });
    }
    
    processingResult.steps.push('extract');
    
    // Step 2: Validate analytics event schema
    console.log('🔍 Step 2: Validating analytics event schema', { correlationId: correlationId });
    validateAnalyticsEventSchema(eventData);
    processingResult.steps.push('validate');
    
    // Step 3: Enrich analytics event with metadata
    console.log('🔍 Step 3: Enriching analytics event with metadata', { correlationId: correlationId });
    const enrichedEvent = enrichAnalyticsEvent(eventData);
    enrichedEvent.correlationId = correlationId; // Ensure consistent correlation ID
    processingResult.metricKey = enrichedEvent.metricKey;
    processingResult.metricType = enrichedEvent.metricType;
    processingResult.steps.push('enrich');
    
    // Step 4: Store analytics event in DynamoDB
    console.log('🔍 Step 4: Storing analytics event in DynamoDB', { correlationId: correlationId });
    await storeAnalyticsEvent(enrichedEvent);
    processingResult.steps.push('store');
    
    // Step 5: Process analytics data
    console.log('🔍 Step 5: Processing analytics data', { correlationId: correlationId });
    await processAnalyticsData(enrichedEvent);
    processingResult.steps.push('process');
    
    // Step 6: Send analytics event to SQS queue
    console.log('🔍 Step 6: Queuing analytics event in SQS', { correlationId: correlationId });
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
    
    console.log('🎉 Analytics processing completed successfully', {
      correlationId: correlationId,
      metricKey: enrichedEvent.metricKey,
      metricType: enrichedEvent.metricType,
      value: enrichedEvent.value,
      unit: enrichedEvent.unit,
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
        'X-Metric-Key': enrichedEvent.metricKey,
        'X-Processing-Time': processingTime.toString()
      },
      body: JSON.stringify({
        success: true,
        metricKey: enrichedEvent.metricKey,
        metricType: enrichedEvent.metricType,
        value: enrichedEvent.value,
        unit: enrichedEvent.unit,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        message: 'Analytics event processed successfully',
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    
    console.error('💥 Analytics processing failed', {
      correlationId: correlationId,
      metricKey: processingResult.metricKey,
      metricType: processingResult.metricType,
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
        metricKey: processingResult.metricKey,
        metricType: processingResult.metricType,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        error: error.message,
        errorType: error.name,
        message: 'Analytics event processing failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};
