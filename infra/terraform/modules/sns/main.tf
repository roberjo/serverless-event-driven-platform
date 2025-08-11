# SNS Topics for Event-Driven Platform

# Main Notification Topic
resource "aws_sns_topic" "notifications" {
  name = "${var.environment}-notifications"

  # Server-side encryption
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Platform Notifications"
    ManagedBy   = "Terraform"
  })
}

# Error Notification Topic
resource "aws_sns_topic" "errors" {
  name = "${var.environment}-errors"

  # Server-side encryption
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Error Notifications"
    ManagedBy   = "Terraform"
  })
}

# Alert Notification Topic
resource "aws_sns_topic" "alerts" {
  name = "${var.environment}-alerts"

  # Server-side encryption
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Alert Notifications"
    ManagedBy   = "Terraform"
  })
}

# ML Processing Topic (for SageMaker integration)
resource "aws_sns_topic" "ml_processing" {
  name = "${var.environment}-ml-processing"

  # Server-side encryption
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "ML Processing Notifications"
    ManagedBy   = "Terraform"
  })
}

# Business Event Topic
resource "aws_sns_topic" "business_events" {
  name = "${var.environment}-business-events"

  # Server-side encryption
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Business Event Notifications"
    ManagedBy   = "Terraform"
  })
}

# Analytics Topic
resource "aws_sns_topic" "analytics" {
  name = "${var.environment}-analytics"

  # Server-side encryption
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Analytics Notifications"
    ManagedBy   = "Terraform"
  })
}

# SNS Topic Policies
resource "aws_sns_topic_policy" "notifications" {
  arn = aws_sns_topic.notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.notifications.arn
      }
    ]
  })
}

resource "aws_sns_topic_policy" "errors" {
  arn = aws_sns_topic.errors.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.errors.arn
      }
    ]
  })
}

resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.alerts.arn
      }
    ]
  })
}

resource "aws_sns_topic_policy" "ml_processing" {
  arn = aws_sns_topic.ml_processing.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.ml_processing.arn
      }
    ]
  })
}

resource "aws_sns_topic_policy" "business_events" {
  arn = aws_sns_topic.business_events.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.business_events.arn
      }
    ]
  })
}

resource "aws_sns_topic_policy" "analytics" {
  arn = aws_sns_topic.analytics.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.analytics.arn
      }
    ]
  })
}
