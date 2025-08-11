variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

variable "event_processor_zip_path" {
  description = "Path to the event processor Lambda function zip file"
  type        = string
}

variable "user_event_processor_zip_path" {
  description = "Path to the user event processor Lambda function zip file"
  type        = string
}

variable "analytics_processor_zip_path" {
  description = "Path to the analytics processor Lambda function zip file"
  type        = string
}

variable "ml_processor_zip_path" {
  description = "Path to the ML processor Lambda function zip file"
  type        = string
}

variable "batch_processor_zip_path" {
  description = "Path to the batch processor Lambda function zip file"
  type        = string
}

variable "events_table_name" {
  description = "Name of the events DynamoDB table"
  type        = string
}

variable "user_events_table_name" {
  description = "Name of the user events DynamoDB table"
  type        = string
}

variable "analytics_table_name" {
  description = "Name of the analytics DynamoDB table"
  type        = string
}

variable "ml_models_table_name" {
  description = "Name of the ML models DynamoDB table"
  type        = string
}

variable "feature_store_table_name" {
  description = "Name of the feature store DynamoDB table"
  type        = string
}

variable "event_bus_name" {
  description = "Name of the EventBridge event bus"
  type        = string
}

variable "event_queue_url" {
  description = "URL of the event processing SQS queue"
  type        = string
}

variable "user_event_queue_url" {
  description = "URL of the user event processing SQS queue"
  type        = string
}

variable "analytics_queue_url" {
  description = "URL of the analytics processing SQS queue"
  type        = string
}

variable "ml_queue_url" {
  description = "URL of the ML processing SQS queue"
  type        = string
}

variable "batch_queue_url" {
  description = "URL of the batch processing SQS queue"
  type        = string
}

variable "notification_topic_arn" {
  description = "ARN of the notification SNS topic"
  type        = string
}

variable "ml_processing_topic_arn" {
  description = "ARN of the ML processing SNS topic"
  type        = string
}
