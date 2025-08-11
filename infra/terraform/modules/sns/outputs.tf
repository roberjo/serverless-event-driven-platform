output "notifications_topic_arn" {
  description = "ARN of the notifications topic"
  value       = aws_sns_topic.notifications.arn
}

output "errors_topic_arn" {
  description = "ARN of the errors topic"
  value       = aws_sns_topic.errors.arn
}

output "alerts_topic_arn" {
  description = "ARN of the alerts topic"
  value       = aws_sns_topic.alerts.arn
}

output "ml_processing_topic_arn" {
  description = "ARN of the ML processing topic"
  value       = aws_sns_topic.ml_processing.arn
}

output "business_events_topic_arn" {
  description = "ARN of the business events topic"
  value       = aws_sns_topic.business_events.arn
}

output "analytics_topic_arn" {
  description = "ARN of the analytics topic"
  value       = aws_sns_topic.analytics.arn
}
