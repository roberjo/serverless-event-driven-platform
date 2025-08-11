output "events_table_name" {
  description = "Name of the events table"
  value       = aws_dynamodb_table.events.name
}

output "events_table_arn" {
  description = "ARN of the events table"
  value       = aws_dynamodb_table.events.arn
}

output "user_events_table_name" {
  description = "Name of the user events table"
  value       = aws_dynamodb_table.user_events.name
}

output "user_events_table_arn" {
  description = "ARN of the user events table"
  value       = aws_dynamodb_table.user_events.arn
}

output "analytics_table_name" {
  description = "Name of the analytics table"
  value       = aws_dynamodb_table.analytics.name
}

output "analytics_table_arn" {
  description = "ARN of the analytics table"
  value       = aws_dynamodb_table.analytics.arn
}

output "metadata_table_name" {
  description = "Name of the metadata table"
  value       = aws_dynamodb_table.metadata.name
}

output "metadata_table_arn" {
  description = "ARN of the metadata table"
  value       = aws_dynamodb_table.metadata.arn
}

output "ml_models_table_name" {
  description = "Name of the ML models table"
  value       = aws_dynamodb_table.ml_models.name
}

output "ml_models_table_arn" {
  description = "ARN of the ML models table"
  value       = aws_dynamodb_table.ml_models.arn
}

output "feature_store_table_name" {
  description = "Name of the feature store table"
  value       = aws_dynamodb_table.feature_store.name
}

output "feature_store_table_arn" {
  description = "ARN of the feature store table"
  value       = aws_dynamodb_table.feature_store.arn
}
