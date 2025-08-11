# Quick Start Guide
## Phase 1 Implementation - Event-Driven Microservices Platform

This guide will help you quickly deploy Phase 1 of the Event-Driven Microservices Platform.

## Prerequisites

Before starting, ensure you have the following installed and configured:

### Required Tools
- **AWS CLI** (v2.x) - [Install Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **Terraform** (v1.0+) - [Install Guide](https://developer.hashicorp.com/terraform/downloads)
- **Node.js** (v18+) - [Install Guide](https://nodejs.org/)
- **PowerShell** (v7.0+) - [Install Guide](https://docs.microsoft.com/en-us/powershell/scripting/install/installing-powershell)

### AWS Configuration
1. **Install AWS CLI** and configure your credentials:
   ```bash
   aws configure
   ```

2. **Verify AWS access**:
   ```bash
   aws sts get-caller-identity
   ```

3. **Ensure sufficient permissions** for the following AWS services:
   - IAM
   - VPC
   - Lambda
   - API Gateway
   - EventBridge
   - DynamoDB
   - SQS
   - SNS
   - CloudWatch
   - X-Ray
   - WAF
   - CloudTrail
   - Config

## Quick Deployment

### Option 1: Automated Deployment (Recommended)

Run the comprehensive Phase 1 deployment script:

```powershell
# Navigate to project root
cd serverless-event-driven-platform

# Run Phase 1 deployment
.\scripts\phase1-deployment.ps1 -Environment dev -Region us-east-1
```

This script will:
- ✅ Check all prerequisites
- ✅ Deploy infrastructure (Week 1-2)
- ✅ Deploy Lambda functions (Week 3-4)
- ✅ Test the platform (Week 5-6)
- ✅ Validate monitoring (Week 7-8)
- ✅ Generate deployment report

### Option 2: Step-by-Step Deployment

If you prefer to deploy components individually:

#### Step 1: Deploy Infrastructure
```powershell
# Deploy only infrastructure
.\scripts\phase1-deployment.ps1 -Environment dev -SkipLambda -SkipTesting
```

#### Step 2: Deploy Lambda Functions
```powershell
# Deploy only Lambda functions
.\scripts\phase1-deployment.ps1 -Environment dev -SkipInfrastructure -SkipTesting
```

#### Step 3: Test Platform
```powershell
# Test the platform
.\scripts\phase1-deployment.ps1 -Environment dev -SkipInfrastructure -SkipLambda
```

## What Gets Deployed

### Infrastructure Components (Week 1-2)
- **VPC** with public/private subnets across 3 AZs
- **NAT Gateways** for private subnet internet access
- **VPC Endpoints** for AWS services
- **Security Groups** and Network ACLs
- **IAM Roles** and Policies
- **WAF Web ACL** with security rules
- **CloudTrail** for audit logging
- **AWS Config** for compliance monitoring

### Core Services (Week 3-4)
- **API Gateway** for event ingestion
- **EventBridge** with custom event bus and routing rules
- **DynamoDB** table for event storage
- **SQS** queues with Dead Letter Queues
- **SNS** topics for notifications
- **Lambda** function for event processing

### Monitoring & Observability (Week 7-8)
- **CloudWatch** dashboards and alarms
- **X-Ray** for distributed tracing
- **Custom metrics** and logging
- **Alerting** system with SNS notifications

## Testing the Platform

After deployment, test the platform with a sample event:

```bash
# Get the API Gateway URL
API_URL=$(aws apigateway get-rest-apis --query "items[?name=='dev-api'].id" --output text)
INVOKE_URL="https://${API_URL}.execute-api.us-east-1.amazonaws.com/dev/events"

# Send a test event
curl -X POST $INVOKE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user.login",
    "eventSource": "web-application",
    "data": {
      "userId": "test-user-123",
      "timestamp": "2024-12-01T10:00:00.000Z",
      "ipAddress": "192.168.1.1"
    }
  }'
```

## Monitoring & Validation

### CloudWatch Dashboard
- Navigate to AWS CloudWatch Console
- Find dashboard: `dev-platform-dashboard`
- Monitor Lambda, API Gateway, DynamoDB, and SQS metrics

### X-Ray Tracing
- Navigate to AWS X-Ray Console
- View traces for event processing
- Analyze performance and identify bottlenecks

### Alerts
- Check SNS topic: `dev-alerts`
- Configure email subscriptions for notifications
- Monitor CloudWatch alarms

## Troubleshooting

### Common Issues

#### 1. AWS Credentials Not Configured
```bash
aws configure
# Enter your Access Key ID, Secret Access Key, Region, and Output format
```

#### 2. Terraform State Lock Issues
```bash
# If Terraform state is locked, check for running processes
terraform force-unlock <LOCK_ID>
```

#### 3. Lambda Function Deployment Fails
```bash
# Check IAM permissions
aws iam get-role --role-name dev-lambda-execution-role

# Verify Lambda function exists
aws lambda get-function --function-name dev-event-processor
```

#### 4. API Gateway Not Responding
```bash
# Check API Gateway deployment
aws apigateway get-deployments --rest-api-id <API_ID>

# Verify Lambda integration
aws apigateway get-integration --rest-api-id <API_ID> --resource-id <RESOURCE_ID> --http-method POST
```

### Logs and Debugging

#### CloudWatch Logs
```bash
# View Lambda function logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/dev-event-processor"

# Get recent log events
aws logs filter-log-events --log-group-name "/aws/lambda/dev-event-processor" --start-time $(date -d '1 hour ago' +%s)000
```

#### X-Ray Traces
```bash
# Get trace summaries
aws xray get-trace-summaries --start-time $(date -d '1 hour ago' +%s) --end-time $(date +%s)
```

## Next Steps

After successful Phase 1 deployment:

1. **Review Documentation**
   - Read `docs/phase1-implementation-steps.md` for detailed steps
   - Review `docs/phase1-quick-reference.md` for quick commands

2. **Test Different Event Types**
   - User events (login, logout, register)
   - Business events (order created, payment processed)
   - System events (function invoked, API request)

3. **Configure Additional Monitoring**
   - Set up custom CloudWatch alarms
   - Configure additional SNS notifications
   - Create custom dashboards

4. **Plan Phase 2**
   - Review `docs/implementation-plan.md` for Phase 2 details
   - Prepare for advanced event processing features
   - Plan AI/ML integration with Amazon Bedrock and SageMaker

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review AWS CloudWatch logs for error details
3. Consult the detailed documentation in the `docs/` directory
4. Check the deployment report in the `reports/` directory

## Cost Optimization

To optimize costs during development:

1. **Use on-demand DynamoDB** for development
2. **Set up CloudWatch log retention** to 7 days for dev
3. **Use single NAT Gateway** for development
4. **Monitor costs** with AWS Cost Explorer
5. **Set up billing alerts** for budget management

---

**Happy Deploying! 🚀**
