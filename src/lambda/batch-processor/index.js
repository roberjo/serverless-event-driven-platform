const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS SDK
const sqs = new AWS.SQS();
const sns = new AWS.SNS();

// Environment variables
const BATCH_QUEUE_URL = process.env.BATCH_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// Batch event schema validation
const validateBatchEventSchema = (event) => {
  const requiredFields = ['batchId', 'operation', 'data'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  if (!event.batchId || typeof event.batchId !== 'string') {
    throw new Error('batchId must be a string');
  }

  if (!event.operation || typeof event.operation !== 'string') {
    throw new Error('operation must be a string');
  }

  if (!event.data || !Array.isArray(event.data)) {
    throw new Error('data must be an array');
  }

  return true;
};

// Enrich batch event with metadata
const enrichBatchEvent = (event) => {
  return {
    batchId: event.batchId,
    operation: event.operation,
    data: event.data,
    timestamp: event.timestamp || new Date().toISOString(),
    correlationId: event.correlationId || uuidv4(),
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'batch-processor-lambda',
      totalItems: event.data.length,
      ...event.metadata
    }
  };
};

// Process batch operation
const processBatchOperation = async (event) => {
  const { operation, data, batchId } = event;
  
  console.log(`Processing batch operation: ${operation} for batch: ${batchId}`);
  console.log(`Total items to process: ${data.length}`);

  const results = [];
  const errors = [];
  let processedCount = 0;

  // Process items in batches of 10 to avoid overwhelming downstream services
  const batchSize = 10;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)}`);

    // Process each item in the current batch
    for (const item of batch) {
      try {
        const result = await processItem(operation, item, batchId);
        results.push(result);
        processedCount++;
      } catch (error) {
        console.error(`Error processing item:`, error);
        errors.push({
          item: item,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < data.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    success: true,
    processedCount: processedCount,
    totalCount: data.length,
    errorCount: errors.length,
    results: results,
    errors: errors
  };
};

// Process individual item based on operation type
const processItem = async (operation, item, batchId) => {
  switch (operation) {
    case 'data_export':
      return await processDataExport(item, batchId);
    case 'data_import':
      return await processDataImport(item, batchId);
    case 'data_cleanup':
      return await processDataCleanup(item, batchId);
    case 'report_generation':
      return await processReportGeneration(item, batchId);
    case 'notification_send':
      return await processNotificationSend(item, batchId);
    case 'backup_creation':
      return await processBackupCreation(item, batchId);
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
};

// Process data export
const processDataExport = async (item, batchId) => {
  // Simulate data export processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
  
  return {
    operation: 'data_export',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      exportedRecords: Math.floor(Math.random() * 1000) + 1,
      fileSize: Math.floor(Math.random() * 1000000) + 1000,
      format: item.format || 'json'
    },
    timestamp: new Date().toISOString()
  };
};

// Process data import
const processDataImport = async (item, batchId) => {
  // Simulate data import processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
  
  return {
    operation: 'data_import',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      importedRecords: Math.floor(Math.random() * 500) + 1,
      skippedRecords: Math.floor(Math.random() * 10),
      errors: []
    },
    timestamp: new Date().toISOString()
  };
};

// Process data cleanup
const processDataCleanup = async (item, batchId) => {
  // Simulate data cleanup processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1500));
  
  return {
    operation: 'data_cleanup',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      cleanedRecords: Math.floor(Math.random() * 100) + 1,
      freedSpace: Math.floor(Math.random() * 1000000) + 1000,
      retentionPolicy: item.retentionPolicy || '30_days'
    },
    timestamp: new Date().toISOString()
  };
};

// Process report generation
const processReportGeneration = async (item, batchId) => {
  // Simulate report generation processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 3000));
  
  return {
    operation: 'report_generation',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      reportId: uuidv4(),
      reportType: item.reportType || 'summary',
      pages: Math.floor(Math.random() * 50) + 1,
      generatedAt: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  };
};

// Process notification send
const processNotificationSend = async (item, batchId) => {
  // Simulate notification sending
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
  
  return {
    operation: 'notification_send',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      recipients: item.recipients || [],
      sentCount: Math.floor(Math.random() * 100) + 1,
      failedCount: Math.floor(Math.random() * 5),
      channel: item.channel || 'email'
    },
    timestamp: new Date().toISOString()
  };
};

// Process backup creation
const processBackupCreation = async (item, batchId) => {
  // Simulate backup creation
  await new Promise(resolve => setTimeout(resolve, Math.random() * 5000));
  
  return {
    operation: 'backup_creation',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      backupId: uuidv4(),
      backupSize: Math.floor(Math.random() * 10000000) + 1000000,
      backupType: item.backupType || 'full',
      location: item.location || 's3://backup-bucket/'
    },
    timestamp: new Date().toISOString()
  };
};

// Send batch event to SQS queue
const sendToSQS = async (event) => {
  const params = {
    QueueUrl: BATCH_QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageAttributes: {
      'operation': {
        DataType: 'String',
        StringValue: event.operation
      },
      'batchId': {
        DataType: 'String',
        StringValue: event.batchId
      },
      'correlationId': {
        DataType: 'String',
        StringValue: event.correlationId
      }
    }
  };

  try {
    const result = await sqs.sendMessage(params).promise();
    console.log(`Batch event sent to SQS: ${event.batchId}`);
    return result;
  } catch (error) {
    console.error('Error sending batch event to SQS:', error);
    throw error;
  }
};

// Send notification
const sendNotification = async (event, status, result = null) => {
  if (!NOTIFICATION_TOPIC_ARN) {
    console.log('No notification topic configured, skipping notification');
    return;
  }

  const message = {
    batchId: event.batchId,
    operation: event.operation,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    result: result
  };

  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message),
    Subject: `Batch Processing: ${status}`,
    MessageAttributes: {
      'operation': {
        DataType: 'String',
        StringValue: event.operation
      },
      'status': {
        DataType: 'String',
        StringValue: status
      }
    }
  };

  try {
    const result = await sns.publish(params).promise();
    console.log(`Batch notification sent: ${event.batchId}`);
    return result;
  } catch (error) {
    console.error('Error sending batch notification:', error);
    // Don't throw error for notification failures
  }
};

// Main handler function
exports.handler = async (event, context) => {
  console.log('Batch processor started');
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

    // Validate batch event schema
    validateBatchEventSchema(eventData);

    // Enrich batch event with metadata
    const enrichedEvent = enrichBatchEvent(eventData);
    enrichedEvent.correlationId = correlationId;

    // Process batch operation
    const result = await processBatchOperation(enrichedEvent);

    // Send batch event to SQS queue for further processing
    await sendToSQS(enrichedEvent);

    // Send success notification
    await sendNotification(enrichedEvent, 'SUCCESS', result);

    const processingTime = Date.now() - startTime;
    console.log(`Batch processing completed successfully in ${processingTime}ms`);
    console.log(`Processed ${result.processedCount}/${result.totalCount} items with ${result.errorCount} errors`);

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        success: true,
        batchId: enrichedEvent.batchId,
        operation: enrichedEvent.operation,
        result: result,
        correlationId: correlationId,
        processingTime: processingTime,
        message: 'Batch processing completed successfully'
      })
    };

  } catch (error) {
    console.error('Error processing batch event:', error);

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
        message: 'Batch processing failed'
      })
    };
  }
};
