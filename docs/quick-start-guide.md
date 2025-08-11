# Quick Start Guide
## Event-Driven Microservices Platform

**Version:** 1.1  
**Date:** December 2024  
**Status:** Phase 1 Source Code Complete - Ready for Deployment  

---

## 🎯 Current Status

- ✅ **Phase 1 Source Code Complete**: All Terraform modules, Lambda functions, and deployment scripts are ready
- ✅ **Infrastructure as Code**: Complete Terraform configuration for all AWS resources
- ✅ **Application Code**: 5 Lambda functions with comprehensive event processing
- ✅ **Documentation**: Complete technical and architectural documentation
- 🔄 **Ready for Deployment**: Next step is cloud deployment and testing

---

## 📋 Prerequisites

### Required Software
- **Terraform** (v1.0.0 or later)
- **Node.js** (v18.0.0 or later)
- **AWS CLI** (v2.0.0 or later)
- **PowerShell** (v7.0 or later for Windows)

### AWS Requirements
- **AWS Account** with appropriate permissions
- **AWS Access Keys** configured
- **S3 Bucket** for Terraform state storage
- **DynamoDB Table** for Terraform state locking (optional but recommended)

### Permissions Required
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:*",
        "iam:*",
        "lambda:*",
        "dynamodb:*",
        "sqs:*",
        "sns:*",
        "events:*",
        "apigateway:*",
        "cloudwatch:*",
        "logs:*",
        "xray:*",
        "wafv2:*",
        "cloudtrail:*",
        "config:*",
        "s3:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 🚀 Quick Deployment

### Option 1: Automated Deployment (Recommended)

```powershell
# Navigate to project root
cd serverless-event-driven-platform

# Run Phase 1 deployment
.\scripts\phase1-deployment.ps1 -Environment dev -Region us-east-1
```

### Option 2: Step-by-Step Deployment

#### Step 1: Environment Setup
```powershell
# Set environment variables
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:TF_VAR_environment = "dev"

# Verify prerequisites
terraform --version
node --version
aws --version
```

#### Step 2: Infrastructure Deployment
```powershell
# Navigate to Terraform directory
cd infra/terraform/environments/dev

# Initialize Terraform
terraform init

# Plan deployment
terraform plan

# Apply infrastructure
terraform apply -auto-approve
```

#### Step 3: Application Deployment
```powershell
# Navigate to Lambda functions
cd ../../../src/lambda

# Build and package Lambda functions
foreach ($function in @("event-processor", "user-event-processor", "analytics-processor", "ml-processor", "batch-processor")) {
    cd $function
    npm install --production
    Compress-Archive -Path * -DestinationPath "$function.zip" -Force
    cd ..
}
```

#### Step 4: Deploy Lambda Functions
```powershell
# Deploy each Lambda function
aws lambda update-function-code --function-name dev-event-processor --zip-file fileb://event-processor.zip
aws lambda update-function-code --function-name dev-user-event-processor --zip-file fileb://user-event-processor.zip
aws lambda update-function-code --function-name dev-analytics-processor --zip-file fileb://analytics-processor.zip
aws lambda update-function-code --function-name dev-ml-processor --zip-file fileb://ml-processor.zip
aws lambda update-function-code --function-name dev-batch-processor --zip-file fileb://batch-processor.zip
```

---

## 🧪 Testing the Platform

### 1. Test Event Ingestion
```bash
# Get API Gateway URL
API_URL=$(aws apigateway get-rest-apis --query 'items[?name==`dev-api`].id' --output text)

# Send test event
curl -X POST "https://$API_URL.execute-api.us-east-1.amazonaws.com/dev/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user.login",
    "eventSource": "web-application",
    "data": {
      "userId": "user123",
      "sessionId": "session456",
      "timestamp": "2024-12-01T10:00:00Z"
    }
  }'
```

### 2. Test User Event Processing
```bash
curl -X POST "https://$API_URL.execute-api.us-east-1.amazonaws.com/dev/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user.profile.update",
    "eventSource": "mobile-app",
    "userId": "user123",
    "data": {
      "profile": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }'
```

### 3. Test Analytics Processing
```bash
curl -X POST "https://$API_URL.execute-api.us-east-1.amazonaws.com/dev/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "analytics.metric",
    "eventSource": "analytics-service",
    "data": {
      "metricKey": "page.views",
      "metricType": "counter",
      "value": 1,
      "dimensions": {
        "page": "/home",
        "userType": "anonymous"
      }
    }
  }'
```

### 4. Test ML Processing
```bash
curl -X POST "https://$API_URL.execute-api.us-east-1.amazonaws.com/dev/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "ml.inference",
    "eventSource": "ml-service",
    "data": {
      "modelId": "sentiment-analysis-v1",
      "modelType": "bedrock",
      "inputData": {
        "prompt": "This product is amazing!",
        "maxTokens": 50,
        "temperature": 0.7
      }
    }
  }'
```

---

## 📊 Monitoring and Validation

### 1. Check CloudWatch Dashboards
- Navigate to AWS CloudWatch Console
- Look for dashboard: `dev-platform-dashboard`
- Verify metrics are being collected

### 2. Check Lambda Function Logs
```bash
# Check event processor logs
aws logs tail /aws/lambda/dev-event-processor --follow

# Check user event processor logs
aws logs tail /aws/lambda/dev-user-event-processor --follow
```

### 3. Check DynamoDB Tables
```bash
# List tables
aws dynamodb list-tables

# Check events table
aws dynamodb scan --table-name dev-events --limit 5

# Check user events table
aws dynamodb scan --table-name dev-user-events --limit 5
```

### 4. Check SQS Queues
```bash
# List queues
aws sqs list-queues

# Check queue attributes
aws sqs get-queue-attributes --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT/dev-event-queue --attribute-names All
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Terraform State Issues
```bash
# If state is locked
terraform force-unlock LOCK_ID

# If state is corrupted
terraform init -reconfigure
```

#### 2. Lambda Function Issues
```bash
# Check function configuration
aws lambda get-function --function-name dev-event-processor

# Check function logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/dev-event-processor
```

#### 3. API Gateway Issues
```bash
# Check API deployment
aws apigateway get-deployments --rest-api-id API_ID

# Check API stages
aws apigateway get-stages --rest-api-id API_ID
```

#### 4. Permission Issues
```bash
# Verify IAM roles
aws iam get-role --role-name dev-lambda-execution-role

# Check role policies
aws iam list-attached-role-policies --role-name dev-lambda-execution-role
```

---

## 📈 Performance Validation

### 1. Load Testing
```bash
# Install Apache Bench (if not available)
# Windows: Download from Apache website
# Linux: sudo apt-get install apache2-utils

# Run load test
ab -n 1000 -c 10 -H "Content-Type: application/json" \
  -p test-event.json \
  https://API_ID.execute-api.us-east-1.amazonaws.com/dev/events
```

### 2. Monitor Performance Metrics
- **Lambda Duration**: Should be < 1000ms for most operations
- **API Gateway Latency**: Should be < 200ms
- **DynamoDB Read/Write Capacity**: Monitor throttling
- **SQS Queue Depth**: Should remain low

### 3. Scale Testing
```bash
# Increase load gradually
ab -n 5000 -c 50 -H "Content-Type: application/json" \
  -p test-event.json \
  https://API_ID.execute-api.us-east-1.amazonaws.com/dev/events
```

---

## 🧹 Cleanup

### Remove All Resources
```powershell
# Navigate to Terraform directory
cd infra/terraform/environments/dev

# Destroy infrastructure
terraform destroy -auto-approve
```

### Clean Up Local Files
```powershell
# Remove Lambda zip files
Remove-Item src/lambda/*/*.zip -Force

# Remove Terraform files
Remove-Item infra/terraform/environments/dev/.terraform* -Recurse -Force
```

---

## 📚 Next Steps

### Phase 2 Development
1. **Advanced Event Processing**: Implement complex event patterns and workflows
2. **Enhanced Data Management**: Add data lake integration and advanced analytics
3. **Security Enhancements**: Implement additional security controls and compliance features
4. **Integration APIs**: Create REST APIs for data access and management
5. **Advanced Monitoring**: Implement custom dashboards and alerting

### Production Deployment
1. **Environment Setup**: Configure staging and production environments
2. **CI/CD Pipeline**: Implement automated deployment pipelines
3. **Security Hardening**: Apply production security standards
4. **Performance Optimization**: Optimize for production workloads
5. **Disaster Recovery**: Implement backup and recovery procedures

---

## 📞 Support

### Documentation
- **Technical Architecture**: `docs/technical-architecture.md`
- **Data Architecture**: `docs/data-architecture.md`
- **Security Architecture**: `docs/security-architecture.md`
- **Monitoring & Observability**: `docs/monitoring-observability.md`
- **Implementation Plan**: `docs/implementation-plan.md`

### Contact
- **Project Manager**: For project coordination and stakeholder management
- **Technical Lead**: For technical architecture and implementation questions
- **Development Team**: For code-specific issues and feature requests

---

**Document Version**: 1.1  
**Last Updated**: December 2024  
**Next Review**: January 2025  
**Document Owner**: Platform Team
