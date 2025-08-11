# EventBridge Module
# Event-Driven Microservices Platform

# Custom Event Bus
resource "aws_cloudwatch_event_bus" "main" {
  name = "${var.environment}-event-bus"

  tags = {
    Name = "${var.environment}-event-bus"
  }
}

# EventBridge Rules
resource "aws_cloudwatch_event_rule" "user_events" {
  name           = "${var.environment}-user-events-rule"
  description    = "Route user-related events"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["web-application", "mobile-app"]
    detail-type = ["user.login", "user.logout", "user.register", "user.profile.update"]
  })

  tags = {
    Name = "${var.environment}-user-events-rule"
  }
}

resource "aws_cloudwatch_event_rule" "business_events" {
  name           = "${var.environment}-business-events-rule"
  description    = "Route business-related events"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["order-system", "inventory-system", "payment-system"]
    detail-type = ["order.created", "order.completed", "inventory.updated", "payment.processed"]
  })

  tags = {
    Name = "${var.environment}-business-events-rule"
  }
}

resource "aws_cloudwatch_event_rule" "system_events" {
  name           = "${var.environment}-system-events-rule"
  description    = "Route system-related events"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["lambda", "api-gateway", "dynamodb"]
    detail-type = ["function.invoked", "api.request", "database.operation"]
  })

  tags = {
    Name = "${var.environment}-system-events-rule"
  }
}

# EventBridge Targets
resource "aws_cloudwatch_event_target" "user_events_lambda" {
  rule           = aws_cloudwatch_event_rule.user_events.name
  target_id      = "UserEventsLambda"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  arn            = var.user_events_lambda_arn

  input_transformer {
    input_paths = {
      eventId       = "$.detail.eventId"
      eventType     = "$.detail-type"
      eventSource   = "$.source"
      timestamp     = "$.time"
      correlationId = "$.detail.correlationId"
      userId        = "$.detail.userId"
      data          = "$.detail.data"
    }
    input_template = jsonencode({
      eventId       = "<eventId>"
      eventType     = "<eventType>"
      eventSource   = "<eventSource>"
      timestamp     = "<timestamp>"
      correlationId = "<correlationId>"
      userId        = "<userId>"
      data          = "<data>"
    })
  }
}

resource "aws_cloudwatch_event_target" "business_events_sqs" {
  rule           = aws_cloudwatch_event_rule.business_events.name
  target_id      = "BusinessEventsSQS"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  arn            = var.business_events_queue_arn

  sqs_target {
    message_group_id = "business-events"
  }
}

resource "aws_cloudwatch_event_target" "system_events_sns" {
  rule           = aws_cloudwatch_event_rule.system_events.name
  target_id      = "SystemEventsSNS"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  arn            = var.system_events_topic_arn
}

# Lambda Permission for EventBridge
resource "aws_lambda_permission" "eventbridge_user_events" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = var.user_events_lambda_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.user_events.arn
}

# Variables
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "user_events_lambda_arn" {
  description = "User events Lambda function ARN"
  type        = string
  default     = ""
}

variable "user_events_lambda_name" {
  description = "User events Lambda function name"
  type        = string
  default     = ""
}

variable "business_events_queue_arn" {
  description = "Business events SQS queue ARN"
  type        = string
  default     = ""
}

variable "system_events_topic_arn" {
  description = "System events SNS topic ARN"
  type        = string
  default     = ""
}

# Outputs
output "eventbridge_bus_arn" {
  description = "EventBridge bus ARN"
  value       = aws_cloudwatch_event_bus.main.arn
}

output "eventbridge_bus_name" {
  description = "EventBridge bus name"
  value       = aws_cloudwatch_event_bus.main.name
}

output "user_events_rule_arn" {
  description = "User events rule ARN"
  value       = aws_cloudwatch_event_rule.user_events.arn
}

output "business_events_rule_arn" {
  description = "Business events rule ARN"
  value       = aws_cloudwatch_event_rule.business_events.arn
}

output "system_events_rule_arn" {
  description = "System events rule ARN"
  value       = aws_cloudwatch_event_rule.system_events.arn
}
