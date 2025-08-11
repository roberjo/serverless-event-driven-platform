# DynamoDB Tables for Event-Driven Platform

# Main Events Table
resource "aws_dynamodb_table" "events" {
  name           = "${var.environment}-events"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "eventId"
  range_key      = "timestamp"

  attribute {
    name = "eventId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "eventType"
    type = "S"
  }

  attribute {
    name = "eventSource"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "correlationId"
    type = "S"
  }

  # Global Secondary Indexes
  global_secondary_index {
    name            = "EventTypeIndex"
    hash_key        = "eventType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "EventSourceIndex"
    hash_key        = "eventSource"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "CorrelationIdIndex"
    hash_key        = "correlationId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "Event Storage"
    ManagedBy   = "Terraform"
  }
}

# User Events Table
resource "aws_dynamodb_table" "user_events" {
  name           = "${var.environment}-user-events"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "timestamp"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "eventType"
    type = "S"
  }

  attribute {
    name = "sessionId"
    type = "S"
  }

  # Global Secondary Indexes
  global_secondary_index {
    name            = "EventTypeIndex"
    hash_key        = "eventType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "SessionIdIndex"
    hash_key        = "sessionId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "User Event Storage"
    ManagedBy   = "Terraform"
  }
}

# Analytics Table
resource "aws_dynamodb_table" "analytics" {
  name           = "${var.environment}-analytics"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "metricKey"
  range_key      = "timestamp"

  attribute {
    name = "metricKey"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "metricType"
    type = "S"
  }

  # Global Secondary Index
  global_secondary_index {
    name            = "MetricTypeIndex"
    hash_key        = "metricType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "Analytics Data"
    ManagedBy   = "Terraform"
  }
}

# Metadata Table
resource "aws_dynamodb_table" "metadata" {
  name           = "${var.environment}-metadata"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "key"
  range_key      = "version"

  attribute {
    name = "key"
    type = "S"
  }

  attribute {
    name = "version"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  # Global Secondary Index
  global_secondary_index {
    name            = "TypeIndex"
    hash_key        = "type"
    range_key       = "version"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "Platform Metadata"
    ManagedBy   = "Terraform"
  }
}

# ML Models Table (for SageMaker integration)
resource "aws_dynamodb_table" "ml_models" {
  name           = "${var.environment}-ml-models"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "modelId"
  range_key      = "version"

  attribute {
    name = "modelId"
    type = "S"
  }

  attribute {
    name = "version"
    type = "S"
  }

  attribute {
    name = "modelType"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # Global Secondary Indexes
  global_secondary_index {
    name            = "ModelTypeIndex"
    hash_key        = "modelType"
    range_key       = "version"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "version"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "ML Model Metadata"
    ManagedBy   = "Terraform"
  }
}

# Feature Store Table (for ML features)
resource "aws_dynamodb_table" "feature_store" {
  name           = "${var.environment}-feature-store"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "featureKey"
  range_key      = "timestamp"

  attribute {
    name = "featureKey"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "featureType"
    type = "S"
  }

  attribute {
    name = "entityId"
    type = "S"
  }

  # Global Secondary Indexes
  global_secondary_index {
    name            = "FeatureTypeIndex"
    hash_key        = "featureType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "EntityIdIndex"
    hash_key        = "entityId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "ML Feature Store"
    ManagedBy   = "Terraform"
  }
}
