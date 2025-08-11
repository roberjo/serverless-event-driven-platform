output "event_processor_function_arn" {
  description = "ARN of the event processor Lambda function"
  value       = aws_lambda_function.event_processor.arn
}

output "event_processor_function_name" {
  description = "Name of the event processor Lambda function"
  value       = aws_lambda_function.event_processor.function_name
}

output "user_event_processor_function_arn" {
  description = "ARN of the user event processor Lambda function"
  value       = aws_lambda_function.user_event_processor.arn
}

output "user_event_processor_function_name" {
  description = "Name of the user event processor Lambda function"
  value       = aws_lambda_function.user_event_processor.function_name
}

output "analytics_processor_function_arn" {
  description = "ARN of the analytics processor Lambda function"
  value       = aws_lambda_function.analytics_processor.arn
}

output "analytics_processor_function_name" {
  description = "Name of the analytics processor Lambda function"
  value       = aws_lambda_function.analytics_processor.function_name
}

output "ml_processor_function_arn" {
  description = "ARN of the ML processor Lambda function"
  value       = aws_lambda_function.ml_processor.arn
}

output "ml_processor_function_name" {
  description = "Name of the ML processor Lambda function"
  value       = aws_lambda_function.ml_processor.function_name
}

output "batch_processor_function_arn" {
  description = "ARN of the batch processor Lambda function"
  value       = aws_lambda_function.batch_processor.arn
}

output "batch_processor_function_name" {
  description = "Name of the batch processor Lambda function"
  value       = aws_lambda_function.batch_processor.function_name
}

output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution IAM role"
  value       = aws_iam_role.lambda_execution.arn
}
