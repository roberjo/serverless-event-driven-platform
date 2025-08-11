# SQS Queues for Event-Driven Platform

# Main Event Processing Queue
resource "aws_sqs_queue" "event_queue" {
  name                       = "${var.environment}-event-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 30

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.event_dlq.arn
    maxReceiveCount     = 3
  })

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Event Processing Queue"
    ManagedBy   = "Terraform"
  })
}

# Dead Letter Queue for Event Queue
resource "aws_sqs_queue" "event_dlq" {
  name                      = "${var.environment}-event-dlq"
  message_retention_seconds = 1209600 # 14 days

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Event Dead Letter Queue"
    ManagedBy   = "Terraform"
  })
}

# User Event Processing Queue
resource "aws_sqs_queue" "user_event_queue" {
  name                       = "${var.environment}-user-event-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 30

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.user_event_dlq.arn
    maxReceiveCount     = 3
  })

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "User Event Processing Queue"
    ManagedBy   = "Terraform"
  })
}

# Dead Letter Queue for User Event Queue
resource "aws_sqs_queue" "user_event_dlq" {
  name                      = "${var.environment}-user-event-dlq"
  message_retention_seconds = 1209600 # 14 days

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "User Event Dead Letter Queue"
    ManagedBy   = "Terraform"
  })
}

# Analytics Processing Queue
resource "aws_sqs_queue" "analytics_queue" {
  name                       = "${var.environment}-analytics-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 60

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analytics_dlq.arn
    maxReceiveCount     = 3
  })

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Analytics Processing Queue"
    ManagedBy   = "Terraform"
  })
}

# Dead Letter Queue for Analytics Queue
resource "aws_sqs_queue" "analytics_dlq" {
  name                      = "${var.environment}-analytics-dlq"
  message_retention_seconds = 1209600 # 14 days

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Analytics Dead Letter Queue"
    ManagedBy   = "Terraform"
  })
}

# ML Processing Queue (for SageMaker integration)
resource "aws_sqs_queue" "ml_queue" {
  name                       = "${var.environment}-ml-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 300 # 5 minutes for ML processing

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ml_dlq.arn
    maxReceiveCount     = 3
  })

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "ML Processing Queue"
    ManagedBy   = "Terraform"
  })
}

# Dead Letter Queue for ML Queue
resource "aws_sqs_queue" "ml_dlq" {
  name                      = "${var.environment}-ml-dlq"
  message_retention_seconds = 1209600 # 14 days

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "ML Dead Letter Queue"
    ManagedBy   = "Terraform"
  })
}

# Batch Processing Queue
resource "aws_sqs_queue" "batch_queue" {
  name                       = "${var.environment}-batch-queue"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 600 # 10 minutes for batch processing

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.batch_dlq.arn
    maxReceiveCount     = 3
  })

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Batch Processing Queue"
    ManagedBy   = "Terraform"
  })
}

# Dead Letter Queue for Batch Queue
resource "aws_sqs_queue" "batch_dlq" {
  name                      = "${var.environment}-batch-dlq"
  message_retention_seconds = 1209600 # 14 days

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Batch Dead Letter Queue"
    ManagedBy   = "Terraform"
  })
}
