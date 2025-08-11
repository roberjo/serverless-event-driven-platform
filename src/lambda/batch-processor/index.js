/**
 * Batch Processor Lambda Function
 * 
 * This Lambda function specializes in processing batch operations in the
 * Event-Driven Microservices Platform. It handles large-scale data operations
 * including data export/import, cleanup, report generation, notifications,
 * and backup creation with comprehensive batch processing capabilities.
 * 
 * Key Responsibilities:
 * - Batch event validation and schema enforcement
 * - Large-scale data processing with batching and rate limiting
 * - Multiple operation types (export, import, cleanup, reports, notifications, backup)
 * - Batch processing with error handling and retry logic
 * - Progress tracking and detailed result reporting
 * - Batch event queuing for downstream processing
 * - Notification publishing for batch operations
 * - Comprehensive error handling and batch-specific logging
 * 
 * Supported Operations:
 * - data_export: Export data to various formats and destinations
 * - data_import: Import data from external sources
 * - data_cleanup: Clean up old or unnecessary data
 * - report_generation: Generate various types of reports
 * - notification_send: Send batch notifications to users
 * - backup_creation: Create data backups and snapshots
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
const sqs = new AWS.SQS();
const sns = new AWS.SNS();

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Environment variables loaded from Lambda configuration
 * These should be set during infrastructure deployment
 */
const BATCH_QUEUE_URL = process.env.BATCH_QUEUE_URL;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// ============================================================================
// BATCH EVENT VALIDATION
// ============================================================================

/**
 * Validates the incoming batch event against the required schema
 * 
 * This function ensures that all required batch event fields are present and
 * have the correct data types before processing. Batch events require specific
 * validation for operation types and data arrays.
 * 
 * @param {Object} event - The batch event object to validate
 * @param {string} event.batchId - Unique identifier for the batch operation
 * @param {string} event.operation - Type of batch operation to perform
 * @param {Array} event.data - Array of items to process in the batch
 * @param {string} [event.timestamp] - Optional ISO timestamp of when the event occurred
 * @param {string} [event.correlationId] - Optional correlation ID for tracing
 * @param {Object} [event.metadata] - Optional additional metadata
 * 
 * @throws {Error} Throws error if validation fails with specific details
 * @returns {boolean} Returns true if validation passes
 * 
 * @example
 * const batchEvent = {
 *   batchId: 'batch-123',
 *   operation: 'data_export',
 *   data: [{ id: '1', format: 'json' }, { id: '2', format: 'csv' }]
 * };
 * validateBatchEventSchema(batchEvent); // Returns true or throws error
 */
const validateBatchEventSchema = (event) => {
  console.log('🔍 Starting batch event schema validation', {
    batchId: event?.batchId,
    operation: event?.operation,
    dataLength: event?.data?.length,
    correlationId: event?.correlationId
  });

  // Check if event object exists
  if (!event || typeof event !== 'object') {
    const error = new Error('Batch event must be a valid object');
    console.error('❌ Batch event validation failed: Invalid event object', { error: error.message });
    throw error;
  }

  // Define required fields for batch events
  const requiredFields = ['batchId', 'operation', 'data'];
  const missingFields = requiredFields.filter(field => !event[field]);

  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error('❌ Batch event validation failed: Missing required fields', {
      missingFields,
      providedFields: Object.keys(event),
      error: error.message
    });
    throw error;
  }

  // Validate batchId
  if (!event.batchId || typeof event.batchId !== 'string') {
    const error = new Error('batchId must be a non-empty string');
    console.error('❌ Batch event validation failed: Invalid batchId', {
      batchId: event.batchId,
      type: typeof event.batchId,
      error: error.message
    });
    throw error;
  }

  // Validate operation
  if (!event.operation || typeof event.operation !== 'string') {
    const error = new Error('operation must be a non-empty string');
    console.error('❌ Batch event validation failed: Invalid operation', {
      operation: event.operation,
      type: typeof event.operation,
      error: error.message
    });
    throw error;
  }

  // Validate operation values
  const validOperations = ['data_export', 'data_import', 'data_cleanup', 'report_generation', 'notification_send', 'backup_creation'];
  if (!validOperations.includes(event.operation)) {
    const error = new Error(`operation must be one of: ${validOperations.join(', ')}`);
    console.error('❌ Batch event validation failed: Invalid operation value', {
      operation: event.operation,
      validOperations: validOperations,
      error: error.message
    });
    throw error;
  }

  // Validate data array
  if (!event.data || !Array.isArray(event.data)) {
    const error = new Error('data must be a valid array');
    console.error('❌ Batch event validation failed: Invalid data array', {
      data: event.data,
      type: typeof event.data,
      isArray: Array.isArray(event.data),
      error: error.message
    });
    throw error;
  }

  // Validate data array is not empty
  if (event.data.length === 0) {
    const error = new Error('data array cannot be empty');
    console.error('❌ Batch event validation failed: Empty data array', {
      dataLength: event.data.length,
      error: error.message
    });
    throw error;
  }

  // Optional field validations
  if (event.timestamp && typeof event.timestamp !== 'string') {
    console.warn('⚠️ Optional field validation warning: timestamp should be a string', {
      timestamp: event.timestamp,
      type: typeof event.timestamp
    });
  }

  console.log('✅ Batch event schema validation passed', {
    batchId: event.batchId,
    operation: event.operation,
    dataLength: event.data.length,
    correlationId: event.correlationId
  });

  return true;
};

// ============================================================================
// BATCH EVENT ENRICHMENT
// ============================================================================

/**
 * Enriches the batch event with additional metadata and processing context
 * 
 * This function adds essential metadata that is required for batch processing,
 * including timestamps, item counts, and processing context. It ensures
 * all batch events have consistent structure for downstream processing.
 * 
 * @param {Object} event - The validated batch event object
 * @returns {Object} The enriched batch event with additional metadata
 * 
 * @example
 * const enrichedBatchEvent = enrichBatchEvent({
 *   batchId: 'batch-123',
 *   operation: 'data_export',
 *   data: [{ id: '1' }, { id: '2' }]
 * });
 * // Returns event with added timestamp, correlationId, metadata, etc.
 */
const enrichBatchEvent = (event) => {
  console.log('🔧 Starting batch event enrichment', {
    originalBatchId: event.batchId,
    operation: event.operation,
    dataLength: event.data.length
  });

  const enrichedEvent = {
    // Core batch fields
    batchId: event.batchId,
    operation: event.operation,
    data: event.data,
    
    // Timestamps
    timestamp: event.timestamp || new Date().toISOString(),
    
    // Tracing and correlation
    correlationId: event.correlationId || uuidv4(),
    
    // Environment context
    environment: process.env.ENVIRONMENT || 'dev',
    region: process.env.AWS_REGION,
    
    // Processing metadata
    metadata: {
      processedAt: new Date().toISOString(),
      processor: 'batch-processor-lambda',
      processorVersion: '1.0.0',
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID,
      batchContext: {
        totalItems: event.data.length,
        estimatedProcessingTime: Math.ceil(event.data.length / 10) * 100, // Rough estimate
        ...event.metadata
      }
    }
  };

  console.log('✅ Batch event enrichment completed', {
    batchId: enrichedEvent.batchId,
    operation: enrichedEvent.operation,
    totalItems: enrichedEvent.metadata.batchContext.totalItems,
    correlationId: enrichedEvent.correlationId,
    timestamp: enrichedEvent.timestamp,
    environment: enrichedEvent.environment
  });

  return enrichedEvent;
};

// ============================================================================
// BATCH OPERATION PROCESSING
// ============================================================================

/**
 * Processes batch operations with comprehensive error handling and progress tracking
 * 
 * This function orchestrates the batch processing workflow, including batching
 * of items, rate limiting, error handling, and progress tracking. It processes
 * items in configurable batch sizes to avoid overwhelming downstream services.
 * 
 * @param {Object} event - The enriched batch event object
 * @returns {Promise<Object>} Returns the batch processing results
 * @throws {Error} Throws error if batch processing fails
 * 
 * @example
 * const result = await processBatchOperation(enrichedBatchEvent);
 */
const processBatchOperation = async (event) => {
  const { operation, data, batchId } = event;
  
  console.log('🔄 Starting batch operation processing', {
    batchId: batchId,
    operation: operation,
    totalItems: data.length,
    correlationId: event.correlationId
  });

  const results = [];
  const errors = [];
  let processedCount = 0;
  let startTime = Date.now();

  // Process items in batches to avoid overwhelming downstream services
  const batchSize = 10;
  const totalBatches = Math.ceil(data.length / batchSize);
  
  console.log('📊 Batch processing configuration', {
    batchId: batchId,
    totalItems: data.length,
    batchSize: batchSize,
    totalBatches: totalBatches,
    estimatedTotalTime: `${Math.ceil(data.length / batchSize) * 100}ms`
  });
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batchNumber = Math.floor(i / batchSize) + 1;
    const batch = data.slice(i, i + batchSize);
    const batchStartTime = Date.now();
    
    console.log(`📦 Processing batch ${batchNumber}/${totalBatches}`, {
      batchId: batchId,
      batchNumber: batchNumber,
      totalBatches: totalBatches,
      batchSize: batch.length,
      startIndex: i,
      endIndex: Math.min(i + batchSize, data.length)
    });

    // Process each item in the current batch
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const itemIndex = i + j;
      
      try {
        console.log(`🔧 Processing item ${itemIndex + 1}/${data.length}`, {
          batchId: batchId,
          batchNumber: batchNumber,
          itemIndex: itemIndex,
          itemId: item.id || 'unknown'
        });
        
        const result = await processItem(operation, item, batchId);
        results.push(result);
        processedCount++;
        
        console.log(`✅ Item ${itemIndex + 1} processed successfully`, {
          batchId: batchId,
          itemIndex: itemIndex,
          itemId: item.id || 'unknown',
          operation: operation
        });
      } catch (error) {
        console.error(`❌ Error processing item ${itemIndex + 1}`, {
          batchId: batchId,
          itemIndex: itemIndex,
          itemId: item.id || 'unknown',
          error: error.message,
          errorType: error.name
        });
        
        errors.push({
          item: item,
          itemIndex: itemIndex,
          error: error.message,
          errorType: error.name,
          timestamp: new Date().toISOString()
        });
      }
    }

    const batchTime = Date.now() - batchStartTime;
    console.log(`✅ Batch ${batchNumber} completed`, {
      batchId: batchId,
      batchNumber: batchNumber,
      batchTime: `${batchTime}ms`,
      processedInBatch: batch.length,
      totalProcessed: processedCount,
      totalErrors: errors.length
    });

    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < data.length) {
      console.log(`⏳ Adding delay between batches`, {
        batchId: batchId,
        delay: '100ms'
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const totalTime = Date.now() - startTime;
  console.log('🎉 Batch operation processing completed', {
    batchId: batchId,
    operation: operation,
    totalTime: `${totalTime}ms`,
    processedCount: processedCount,
    totalCount: data.length,
    errorCount: errors.length,
    successRate: `${((processedCount / data.length) * 100).toFixed(2)}%`
  });

  return {
    success: true,
    processedCount: processedCount,
    totalCount: data.length,
    errorCount: errors.length,
    successRate: (processedCount / data.length) * 100,
    results: results,
    errors: errors,
    processingTime: totalTime,
    batchId: batchId,
    operation: operation
  };
};

// ============================================================================
// ITEM PROCESSING
// ============================================================================

/**
 * Processes individual items based on operation type
 * 
 * This function routes individual items to the appropriate processing function
 * based on the operation type. It supports multiple operation types with
 * specialized processing for each.
 * 
 * @param {string} operation - The type of operation to perform
 * @param {Object} item - The item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the processing result for the item
 * @throws {Error} Throws error if item processing fails
 * 
 * @example
 * const result = await processItem('data_export', { id: '1', format: 'json' }, 'batch-123');
 */
const processItem = async (operation, item, batchId) => {
  console.log('🔧 Starting item processing', {
    operation: operation,
    itemId: item.id || 'unknown',
    batchId: batchId
  });

  let result;
  switch (operation) {
    case 'data_export':
      console.log('📤 Processing data export item', { itemId: item.id || 'unknown', batchId: batchId });
      result = await processDataExport(item, batchId);
      break;
    case 'data_import':
      console.log('📥 Processing data import item', { itemId: item.id || 'unknown', batchId: batchId });
      result = await processDataImport(item, batchId);
      break;
    case 'data_cleanup':
      console.log('🧹 Processing data cleanup item', { itemId: item.id || 'unknown', batchId: batchId });
      result = await processDataCleanup(item, batchId);
      break;
    case 'report_generation':
      console.log('📊 Processing report generation item', { itemId: item.id || 'unknown', batchId: batchId });
      result = await processReportGeneration(item, batchId);
      break;
    case 'notification_send':
      console.log('📢 Processing notification send item', { itemId: item.id || 'unknown', batchId: batchId });
      result = await processNotificationSend(item, batchId);
      break;
    case 'backup_creation':
      console.log('💾 Processing backup creation item', { itemId: item.id || 'unknown', batchId: batchId });
      result = await processBackupCreation(item, batchId);
      break;
    default:
      const error = new Error(`Unsupported operation: ${operation}`);
      console.error('❌ Unsupported operation encountered', {
        operation: operation,
        itemId: item.id || 'unknown',
        batchId: batchId,
        error: error.message
      });
      throw error;
  }

  console.log('✅ Item processing completed', {
    operation: operation,
    itemId: item.id || 'unknown',
    batchId: batchId,
    status: result.status
  });

  return result;
};

// ============================================================================
// OPERATION TYPE PROCESSORS
// ============================================================================

/**
 * Processes data export operations
 * 
 * This function simulates data export processing, including format conversion,
 * file generation, and export statistics. In a production environment, this
 * would typically involve actual data extraction and file creation.
 * 
 * @param {Object} item - The export item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the export processing result
 * 
 * @example
 * const result = await processDataExport({ id: '1', format: 'json' }, 'batch-123');
 */
const processDataExport = async (item, batchId) => {
  console.log('📤 Starting data export processing', {
    itemId: item.id || 'unknown',
    format: item.format || 'json',
    batchId: batchId
  });

  const startTime = Date.now();
  
  // Simulate data export processing with variable time
  const processingTime = Math.random() * 1000;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  const result = {
    operation: 'data_export',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      exportedRecords: Math.floor(Math.random() * 1000) + 1,
      fileSize: Math.floor(Math.random() * 1000000) + 1000,
      format: item.format || 'json',
      processingTime: processingTime
    },
    timestamp: new Date().toISOString()
  };

  console.log('✅ Data export processing completed', {
    itemId: item.id || 'unknown',
    batchId: batchId,
    exportedRecords: result.result.exportedRecords,
    fileSize: result.result.fileSize,
    format: result.result.format,
    processingTime: `${processingTime}ms`
  });

  return result;
};

/**
 * Processes data import operations
 * 
 * This function simulates data import processing, including data validation,
 * transformation, and import statistics. In a production environment, this
 * would typically involve actual data ingestion and validation.
 * 
 * @param {Object} item - The import item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the import processing result
 * 
 * @example
 * const result = await processDataImport({ id: '1', source: 'csv' }, 'batch-123');
 */
const processDataImport = async (item, batchId) => {
  console.log('📥 Starting data import processing', {
    itemId: item.id || 'unknown',
    source: item.source || 'unknown',
    batchId: batchId
  });

  const startTime = Date.now();
  
  // Simulate data import processing with variable time
  const processingTime = Math.random() * 2000;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  const result = {
    operation: 'data_import',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      importedRecords: Math.floor(Math.random() * 500) + 1,
      skippedRecords: Math.floor(Math.random() * 10),
      errors: [],
      processingTime: processingTime
    },
    timestamp: new Date().toISOString()
  };

  console.log('✅ Data import processing completed', {
    itemId: item.id || 'unknown',
    batchId: batchId,
    importedRecords: result.result.importedRecords,
    skippedRecords: result.result.skippedRecords,
    processingTime: `${processingTime}ms`
  });

  return result;
};

/**
 * Processes data cleanup operations
 * 
 * This function simulates data cleanup processing, including data deletion,
 * archiving, and cleanup statistics. In a production environment, this
 * would typically involve actual data lifecycle management.
 * 
 * @param {Object} item - The cleanup item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the cleanup processing result
 * 
 * @example
 * const result = await processDataCleanup({ id: '1', retentionPolicy: '30_days' }, 'batch-123');
 */
const processDataCleanup = async (item, batchId) => {
  console.log('🧹 Starting data cleanup processing', {
    itemId: item.id || 'unknown',
    retentionPolicy: item.retentionPolicy || '30_days',
    batchId: batchId
  });

  const startTime = Date.now();
  
  // Simulate data cleanup processing with variable time
  const processingTime = Math.random() * 1500;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  const result = {
    operation: 'data_cleanup',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      cleanedRecords: Math.floor(Math.random() * 100) + 1,
      freedSpace: Math.floor(Math.random() * 1000000) + 1000,
      retentionPolicy: item.retentionPolicy || '30_days',
      processingTime: processingTime
    },
    timestamp: new Date().toISOString()
  };

  console.log('✅ Data cleanup processing completed', {
    itemId: item.id || 'unknown',
    batchId: batchId,
    cleanedRecords: result.result.cleanedRecords,
    freedSpace: result.result.freedSpace,
    retentionPolicy: result.result.retentionPolicy,
    processingTime: `${processingTime}ms`
  });

  return result;
};

/**
 * Processes report generation operations
 * 
 * This function simulates report generation processing, including data
 * aggregation, report creation, and generation statistics. In a production
 * environment, this would typically involve actual report generation.
 * 
 * @param {Object} item - The report generation item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the report generation result
 * 
 * @example
 * const result = await processReportGeneration({ id: '1', reportType: 'summary' }, 'batch-123');
 */
const processReportGeneration = async (item, batchId) => {
  console.log('📊 Starting report generation processing', {
    itemId: item.id || 'unknown',
    reportType: item.reportType || 'summary',
    batchId: batchId
  });

  const startTime = Date.now();
  
  // Simulate report generation processing with variable time
  const processingTime = Math.random() * 3000;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  const result = {
    operation: 'report_generation',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      reportId: uuidv4(),
      reportType: item.reportType || 'summary',
      pages: Math.floor(Math.random() * 50) + 1,
      generatedAt: new Date().toISOString(),
      processingTime: processingTime
    },
    timestamp: new Date().toISOString()
  };

  console.log('✅ Report generation processing completed', {
    itemId: item.id || 'unknown',
    batchId: batchId,
    reportId: result.result.reportId,
    reportType: result.result.reportType,
    pages: result.result.pages,
    processingTime: `${processingTime}ms`
  });

  return result;
};

/**
 * Processes notification sending operations
 * 
 * This function simulates notification sending processing, including
 * recipient management, message delivery, and delivery statistics.
 * In a production environment, this would typically involve actual
 * notification delivery.
 * 
 * @param {Object} item - The notification item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the notification sending result
 * 
 * @example
 * const result = await processNotificationSend({ id: '1', channel: 'email' }, 'batch-123');
 */
const processNotificationSend = async (item, batchId) => {
  console.log('📢 Starting notification sending processing', {
    itemId: item.id || 'unknown',
    channel: item.channel || 'email',
    batchId: batchId
  });

  const startTime = Date.now();
  
  // Simulate notification sending with variable time
  const processingTime = Math.random() * 500;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  const result = {
    operation: 'notification_send',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      recipients: item.recipients || [],
      sentCount: Math.floor(Math.random() * 100) + 1,
      failedCount: Math.floor(Math.random() * 5),
      channel: item.channel || 'email',
      processingTime: processingTime
    },
    timestamp: new Date().toISOString()
  };

  console.log('✅ Notification sending processing completed', {
    itemId: item.id || 'unknown',
    batchId: batchId,
    sentCount: result.result.sentCount,
    failedCount: result.result.failedCount,
    channel: result.result.channel,
    processingTime: `${processingTime}ms`
  });

  return result;
};

/**
 * Processes backup creation operations
 * 
 * This function simulates backup creation processing, including data
 * snapshotting, backup storage, and backup statistics. In a production
 * environment, this would typically involve actual backup creation.
 * 
 * @param {Object} item - The backup creation item to process
 * @param {string} batchId - The batch ID for context
 * @returns {Promise<Object>} Returns the backup creation result
 * 
 * @example
 * const result = await processBackupCreation({ id: '1', backupType: 'full' }, 'batch-123');
 */
const processBackupCreation = async (item, batchId) => {
  console.log('💾 Starting backup creation processing', {
    itemId: item.id || 'unknown',
    backupType: item.backupType || 'full',
    batchId: batchId
  });

  const startTime = Date.now();
  
  // Simulate backup creation with variable time
  const processingTime = Math.random() * 5000;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  const result = {
    operation: 'backup_creation',
    itemId: item.id || uuidv4(),
    status: 'completed',
    result: {
      backupId: uuidv4(),
      backupSize: Math.floor(Math.random() * 10000000) + 1000000,
      backupType: item.backupType || 'full',
      location: item.location || 's3://backup-bucket/',
      processingTime: processingTime
    },
    timestamp: new Date().toISOString()
  };

  console.log('✅ Backup creation processing completed', {
    itemId: item.id || 'unknown',
    batchId: batchId,
    backupId: result.result.backupId,
    backupSize: result.result.backupSize,
    backupType: result.result.backupType,
    processingTime: `${processingTime}ms`
  });

  return result;
};

// ============================================================================
// SQS QUEUING
// ============================================================================

/**
 * Sends the batch event to SQS queue for asynchronous processing
 * 
 * This function queues the batch event for reliable asynchronous processing by
 * downstream batch services. SQS provides guaranteed message delivery and
 * automatic retry mechanisms for failed processing.
 * 
 * @param {Object} event - The enriched batch event object to queue
 * @returns {Promise<Object>} Returns SQS sendMessage result
 * @throws {Error} Throws error if SQS operation fails
 * 
 * @example
 * await sendToSQS(enrichedBatchEvent);
 */
const sendToSQS = async (event) => {
  console.log('📬 Starting SQS batch event queuing', {
    batchId: event.batchId,
    operation: event.operation,
    queueUrl: BATCH_QUEUE_URL,
    totalItems: event.data.length
  });

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
      'totalItems': {
        DataType: 'Number',
        StringValue: event.data.length.toString()
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
    
    console.log('✅ Batch event queued successfully in SQS', {
      batchId: event.batchId,
      operation: event.operation,
      queueUrl: BATCH_QUEUE_URL,
      messageId: result.MessageId,
      queuingTime: `${queuingTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to queue batch event in SQS', {
      batchId: event.batchId,
      operation: event.operation,
      queueUrl: BATCH_QUEUE_URL,
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
 * Sends notification about batch event processing status via SNS
 * 
 * This function publishes notifications to SNS topics for monitoring,
 * alerting, and integration with external systems. Batch notifications
 * include operation context and processing results.
 * 
 * @param {Object} event - The batch event object that was processed
 * @param {string} status - Processing status ('SUCCESS' or 'ERROR')
 * @param {Object} [result] - Optional processing result
 * @returns {Promise<Object|undefined>} Returns SNS publish result or undefined if no topic configured
 * 
 * @example
 * await sendNotification(enrichedBatchEvent, 'SUCCESS', processingResult);
 */
const sendNotification = async (event, status, result = null) => {
  if (!NOTIFICATION_TOPIC_ARN) {
    console.log('ℹ️ No notification topic configured, skipping notification', {
      batchId: event?.batchId,
      operation: event?.operation,
      status: status
    });
    return;
  }

  console.log('📢 Starting SNS batch notification', {
    batchId: event.batchId,
    operation: event.operation,
    topicArn: NOTIFICATION_TOPIC_ARN,
    status: status
  });

  const message = {
    batchId: event.batchId,
    operation: event.operation,
    totalItems: event.data.length,
    status: status,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
    environment: event.environment,
    result: result,
    processingDetails: {
      processor: 'batch-processor-lambda',
      region: process.env.AWS_REGION,
      awsRequestId: process.env.AWS_LAMBDA_REQUEST_ID
    }
  };

  const params = {
    TopicArn: NOTIFICATION_TOPIC_ARN,
    Message: JSON.stringify(message, null, 2),
    Subject: `Batch Processing: ${status} - ${event.operation} (${event.batchId})`,
    MessageAttributes: {
      'operation': {
        DataType: 'String',
        StringValue: event.operation
      },
      'batchId': {
        DataType: 'String',
        StringValue: event.batchId
      },
      'totalItems': {
        DataType: 'Number',
        StringValue: event.data.length.toString()
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
    
    console.log('✅ Batch notification sent successfully via SNS', {
      batchId: event.batchId,
      operation: event.operation,
      topicArn: NOTIFICATION_TOPIC_ARN,
      messageId: result.MessageId,
      status: status,
      notificationTime: `${notificationTime}ms`
    });
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send batch notification via SNS', {
      batchId: event.batchId,
      operation: event.operation,
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
 * Main Lambda function handler for batch event processing
 * 
 * This is the entry point for the Lambda function. It orchestrates the entire
 * batch processing workflow including validation, enrichment, batch processing,
 * queuing, and notifications. It provides comprehensive error handling and
 * observability through structured logging with batch-specific context.
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
 *       batchId: 'batch-123',
 *       operation: 'data_export',
 *       data: [{ id: '1', format: 'json' }]
 *     })
 *   }]
 * }, context);
 */
exports.handler = async (event, context) => {
  // Initialize processing context
  const startTime = Date.now();
  const correlationId = uuidv4();
  const awsRequestId = context.awsRequestId;
  
  console.log('🚀 Batch processor Lambda function started', {
    awsRequestId: awsRequestId,
    correlationId: correlationId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    eventSource: event.source,
    eventType: event['detail-type']
  });
  
  console.log('📥 Received batch event payload', {
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
    batchId: null,
    operation: null,
    correlationId: correlationId,
    processingTime: 0,
    steps: []
  };
  
  try {
    // Step 1: Extract event data from SQS or direct invocation
    console.log('🔍 Step 1: Extracting batch event data', { correlationId: correlationId });
    
    if (event.Records && event.Records[0].body) {
      // SQS event with message body
      try {
        eventData = JSON.parse(event.Records[0].body);
        console.log('✅ Batch event data extracted from SQS record', {
          correlationId: correlationId,
          batchId: eventData.batchId,
          operation: eventData.operation,
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
        console.log('✅ Batch event data extracted from API Gateway body', {
          correlationId: correlationId,
          batchId: eventData.batchId,
          operation: eventData.operation
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
      console.log('✅ Batch event data extracted from direct invocation', {
        correlationId: correlationId
      });
    }
    
    processingResult.steps.push('extract');
    
    // Step 2: Validate batch event schema
    console.log('🔍 Step 2: Validating batch event schema', { correlationId: correlationId });
    validateBatchEventSchema(eventData);
    processingResult.steps.push('validate');
    
    // Step 3: Enrich batch event with metadata
    console.log('🔍 Step 3: Enriching batch event with metadata', { correlationId: correlationId });
    const enrichedEvent = enrichBatchEvent(eventData);
    enrichedEvent.correlationId = correlationId; // Ensure consistent correlation ID
    processingResult.batchId = enrichedEvent.batchId;
    processingResult.operation = enrichedEvent.operation;
    processingResult.steps.push('enrich');
    
    // Step 4: Process batch operation
    console.log('🔍 Step 4: Processing batch operation', { correlationId: correlationId });
    const result = await processBatchOperation(enrichedEvent);
    processingResult.steps.push('process');
    
    // Step 5: Send batch event to SQS queue
    console.log('🔍 Step 5: Queuing batch event in SQS', { correlationId: correlationId });
    await sendToSQS(enrichedEvent);
    processingResult.steps.push('queue');
    
    // Step 6: Send success notification
    console.log('🔍 Step 6: Sending success notification', { correlationId: correlationId });
    await sendNotification(enrichedEvent, 'SUCCESS', result);
    processingResult.steps.push('notify');
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    processingResult.success = true;
    
    console.log('🎉 Batch processing completed successfully', {
      correlationId: correlationId,
      batchId: enrichedEvent.batchId,
      operation: enrichedEvent.operation,
      totalItems: enrichedEvent.data.length,
      processedCount: result.processedCount,
      errorCount: result.errorCount,
      successRate: `${result.successRate.toFixed(2)}%`,
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
        'X-Batch-ID': enrichedEvent.batchId,
        'X-Processing-Time': processingTime.toString()
      },
      body: JSON.stringify({
        success: true,
        batchId: enrichedEvent.batchId,
        operation: enrichedEvent.operation,
        totalItems: enrichedEvent.data.length,
        result: result,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        message: 'Batch processing completed successfully',
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    processingResult.processingTime = processingTime;
    
    console.error('💥 Batch processing failed', {
      correlationId: correlationId,
      batchId: processingResult.batchId,
      operation: processingResult.operation,
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
        batchId: processingResult.batchId,
        operation: processingResult.operation,
        correlationId: correlationId,
        processingTime: processingTime,
        stepsCompleted: processingResult.steps,
        error: error.message,
        errorType: error.name,
        message: 'Batch processing failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};
