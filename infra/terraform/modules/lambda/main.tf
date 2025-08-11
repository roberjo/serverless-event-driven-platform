# Lambda Functions for Event-Driven Platform

# Event Processor Lambda Function
resource "aws_lambda_function" "event_processor" {
  filename         = var.event_processor_zip_path
  function_name    = "${var.environment}-event-processor"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      EVENTS_TABLE         = var.events_table_name
      EVENT_BUS_NAME       = var.event_bus_name
      EVENT_QUEUE_URL      = var.event_queue_url
      NOTIFICATION_TOPIC_ARN = var.notification_topic_arn
    }
  }

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Event Processing"
    ManagedBy   = "Terraform"
  })
}

# User Event Processor Lambda Function
resource "aws_lambda_function" "user_event_processor" {
  filename         = var.user_event_processor_zip_path
  function_name    = "${var.environment}-user-event-processor"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      USER_EVENTS_TABLE    = var.user_events_table_name
      USER_EVENT_QUEUE_URL = var.user_event_queue_url
      NOTIFICATION_TOPIC_ARN = var.notification_topic_arn
    }
  }

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "User Event Processing"
    ManagedBy   = "Terraform"
  })
}

# Analytics Processor Lambda Function
resource "aws_lambda_function" "analytics_processor" {
  filename         = var.analytics_processor_zip_path
  function_name    = "${var.environment}-analytics-processor"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 60
  memory_size     = 512

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      ANALYTICS_TABLE      = var.analytics_table_name
      ANALYTICS_QUEUE_URL  = var.analytics_queue_url
      NOTIFICATION_TOPIC_ARN = var.notification_topic_arn
    }
  }

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Analytics Processing"
    ManagedBy   = "Terraform"
  })
}

# ML Processor Lambda Function (for SageMaker integration)
resource "aws_lambda_function" "ml_processor" {
  filename         = var.ml_processor_zip_path
  function_name    = "${var.environment}-ml-processor"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 300
  memory_size     = 1024

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      ML_MODELS_TABLE      = var.ml_models_table_name
      FEATURE_STORE_TABLE  = var.feature_store_table_name
      ML_QUEUE_URL         = var.ml_queue_url
      ML_PROCESSING_TOPIC_ARN = var.ml_processing_topic_arn
    }
  }

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "ML Processing"
    ManagedBy   = "Terraform"
  })
}

# Batch Processor Lambda Function
resource "aws_lambda_function" "batch_processor" {
  filename         = var.batch_processor_zip_path
  function_name    = "${var.environment}-batch-processor"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 600
  memory_size     = 1024

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      BATCH_QUEUE_URL      = var.batch_queue_url
      NOTIFICATION_TOPIC_ARN = var.notification_topic_arn
    }
  }

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Batch Processing"
    ManagedBy   = "Terraform"
  })
}

# Lambda IAM Role
resource "aws_iam_role" "lambda_execution" {
  name = "${var.environment}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Lambda Execution Role"
    ManagedBy   = "Terraform"
  })
}

# Lambda Execution Policy
resource "aws_iam_role_policy" "lambda_execution" {
  name = "${var.environment}-lambda-execution-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:aws:dynamodb:*:*:table/${var.environment}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          "arn:aws:sqs:*:*:${var.environment}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          "arn:aws:sns:*:*:${var.environment}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = [
          "arn:aws:events:*:*:event-bus/${var.environment}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "event_processor" {
  name              = "/aws/lambda/${aws_lambda_function.event_processor.function_name}"
  retention_in_days = 14

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Event Processor Logs"
    ManagedBy   = "Terraform"
  })
}

resource "aws_cloudwatch_log_group" "user_event_processor" {
  name              = "/aws/lambda/${aws_lambda_function.user_event_processor.function_name}"
  retention_in_days = 14

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "User Event Processor Logs"
    ManagedBy   = "Terraform"
  })
}

resource "aws_cloudwatch_log_group" "analytics_processor" {
  name              = "/aws/lambda/${aws_lambda_function.analytics_processor.function_name}"
  retention_in_days = 14

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Analytics Processor Logs"
    ManagedBy   = "Terraform"
  })
}

resource "aws_cloudwatch_log_group" "ml_processor" {
  name              = "/aws/lambda/${aws_lambda_function.ml_processor.function_name}"
  retention_in_days = 14

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "ML Processor Logs"
    ManagedBy   = "Terraform"
  })
}

resource "aws_cloudwatch_log_group" "batch_processor" {
  name              = "/aws/lambda/${aws_lambda_function.batch_processor.function_name}"
  retention_in_days = 14

  tags = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Batch Processor Logs"
    ManagedBy   = "Terraform"
  })
}
