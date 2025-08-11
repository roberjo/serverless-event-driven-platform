output "event_queue_url" {
  description = "URL of the event processing queue"
  value       = aws_sqs_queue.event_queue.url
}

output "event_queue_arn" {
  description = "ARN of the event processing queue"
  value       = aws_sqs_queue.event_queue.arn
}

output "event_dlq_url" {
  description = "URL of the event dead letter queue"
  value       = aws_sqs_queue.event_dlq.url
}

output "event_dlq_arn" {
  description = "ARN of the event dead letter queue"
  value       = aws_sqs_queue.event_dlq.arn
}

output "user_event_queue_url" {
  description = "URL of the user event processing queue"
  value       = aws_sqs_queue.user_event_queue.url
}

output "user_event_queue_arn" {
  description = "ARN of the user event processing queue"
  value       = aws_sqs_queue.user_event_queue.arn
}

output "user_event_dlq_url" {
  description = "URL of the user event dead letter queue"
  value       = aws_sqs_queue.user_event_dlq.url
}

output "user_event_dlq_arn" {
  description = "ARN of the user event dead letter queue"
  value       = aws_sqs_queue.user_event_dlq.arn
}

output "analytics_queue_url" {
  description = "URL of the analytics processing queue"
  value       = aws_sqs_queue.analytics_queue.url
}

output "analytics_queue_arn" {
  description = "ARN of the analytics processing queue"
  value       = aws_sqs_queue.analytics_queue.arn
}

output "analytics_dlq_url" {
  description = "URL of the analytics dead letter queue"
  value       = aws_sqs_queue.analytics_dlq.url
}

output "analytics_dlq_arn" {
  description = "ARN of the analytics dead letter queue"
  value       = aws_sqs_queue.analytics_dlq.arn
}

output "ml_queue_url" {
  description = "URL of the ML processing queue"
  value       = aws_sqs_queue.ml_queue.url
}

output "ml_queue_arn" {
  description = "ARN of the ML processing queue"
  value       = aws_sqs_queue.ml_queue.arn
}

output "ml_dlq_url" {
  description = "URL of the ML dead letter queue"
  value       = aws_sqs_queue.ml_dlq.url
}

output "ml_dlq_arn" {
  description = "ARN of the ML dead letter queue"
  value       = aws_sqs_queue.ml_dlq.arn
}

output "batch_queue_url" {
  description = "URL of the batch processing queue"
  value       = aws_sqs_queue.batch_queue.url
}

output "batch_queue_arn" {
  description = "ARN of the batch processing queue"
  value       = aws_sqs_queue.batch_queue.arn
}

output "batch_dlq_url" {
  description = "URL of the batch dead letter queue"
  value       = aws_sqs_queue.batch_dlq.url
}

output "batch_dlq_arn" {
  description = "ARN of the batch dead letter queue"
  value       = aws_sqs_queue.batch_dlq.arn
}
