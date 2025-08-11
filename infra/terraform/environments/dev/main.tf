# Development Environment Configuration
# Event-Driven Microservices Platform

terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "event-driven-platform-terraform-state-dev"
    key    = "dev/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
      Owner       = var.team_owner
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "event-driven-platform"
}

variable "team_owner" {
  description = "Team owner"
  type        = string
  default     = "platform-team"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

variable "event_processor_zip_path" {
  description = "Path to the event processor Lambda function zip file"
  type        = string
  default     = "src/lambda/event-processor/event-processor.zip"
}

variable "user_event_processor_zip_path" {
  description = "Path to the user event processor Lambda function zip file"
  type        = string
  default     = "src/lambda/user-event-processor/user-event-processor.zip"
}

variable "analytics_processor_zip_path" {
  description = "Path to the analytics processor Lambda function zip file"
  type        = string
  default     = "src/lambda/analytics-processor/analytics-processor.zip"
}

variable "ml_processor_zip_path" {
  description = "Path to the ML processor Lambda function zip file"
  type        = string
  default     = "src/lambda/ml-processor/ml-processor.zip"
}

variable "batch_processor_zip_path" {
  description = "Path to the batch processor Lambda function zip file"
  type        = string
  default     = "src/lambda/batch-processor/batch-processor.zip"
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "api_gateway_url" {
  description = "API Gateway URL"
  value       = module.api_gateway.api_gateway_url
}

output "eventbridge_bus_arn" {
  description = "EventBridge bus ARN"
  value       = module.eventbridge.eventbridge_bus_arn
}

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = module.dynamodb.table_name
}

# Modules
module "vpc" {
  source = "../../modules/vpc"

  vpc_cidr             = var.vpc_cidr
  environment          = var.environment
  availability_zones   = var.availability_zones
  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_vpn_gateway   = false
}

module "security" {
  source = "../../modules/security"

  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

module "monitoring" {
  source = "../../modules/monitoring"

  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

module "api_gateway" {
  source = "../../modules/api_gateway"

  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

module "eventbridge" {
  source = "../../modules/eventbridge"

  environment = var.environment
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  environment = var.environment
  tags        = var.tags
}

module "lambda" {
  source = "../../modules/lambda"

  environment                    = var.environment
  tags                          = var.tags
  event_processor_zip_path      = var.event_processor_zip_path
  user_event_processor_zip_path = var.user_event_processor_zip_path
  analytics_processor_zip_path  = var.analytics_processor_zip_path
  ml_processor_zip_path         = var.ml_processor_zip_path
  batch_processor_zip_path      = var.batch_processor_zip_path
  events_table_name             = module.dynamodb.events_table_name
  user_events_table_name        = module.dynamodb.user_events_table_name
  analytics_table_name          = module.dynamodb.analytics_table_name
  ml_models_table_name          = module.dynamodb.ml_models_table_name
  feature_store_table_name      = module.dynamodb.feature_store_table_name
  event_bus_name                = module.eventbridge.event_bus_name
  event_queue_url               = module.sqs.event_queue_url
  user_event_queue_url          = module.sqs.user_event_queue_url
  analytics_queue_url           = module.sqs.analytics_queue_url
  ml_queue_url                  = module.sqs.ml_queue_url
  batch_queue_url               = module.sqs.batch_queue_url
  notification_topic_arn        = module.sns.notifications_topic_arn
  ml_processing_topic_arn       = module.sns.ml_processing_topic_arn
}

module "sqs" {
  source = "../../modules/sqs"

  environment = var.environment
  tags        = var.tags
}

module "sns" {
  source = "../../modules/sns"

  environment = var.environment
  tags        = var.tags
}
