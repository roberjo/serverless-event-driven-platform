# Phase 1 Deployment Script
# Event-Driven Microservices Platform
# Following the detailed implementation plan

param(
    [Parameter(Mandatory=$true)]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipInfrastructure,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipLambda,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipTesting
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Script variables
$ProjectName = "event-driven-platform"
$StartTime = Get-Date

Write-Host "🚀 Starting Phase 1 Implementation - Event-Driven Microservices Platform" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host "Start Time: $StartTime" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# Function to log progress
function Write-ProgressLog {
    param(
        [string]$Step,
        [string]$Message,
        [string]$Status = "INFO"
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Status) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        default { "Blue" }
    }
    
    Write-Host "[$timestamp] [$Step] $Message" -ForegroundColor $color
}

# Function to check prerequisites
function Test-Prerequisites {
    Write-ProgressLog "PREREQ" "Checking prerequisites..."
    
    # Check AWS CLI
    try {
        $awsVersion = aws --version
        Write-ProgressLog "PREREQ" "AWS CLI: $awsVersion" "SUCCESS"
    }
    catch {
        Write-ProgressLog "PREREQ" "AWS CLI not found" "ERROR"
        throw "AWS CLI is required but not installed"
    }
    
    # Check Terraform
    try {
        $terraformVersion = terraform --version
        Write-ProgressLog "PREREQ" "Terraform: $terraformVersion" "SUCCESS"
    }
    catch {
        Write-ProgressLog "PREREQ" "Terraform not found" "ERROR"
        throw "Terraform is required but not installed"
    }
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-ProgressLog "PREREQ" "Node.js: $nodeVersion" "SUCCESS"
    }
    catch {
        Write-ProgressLog "PREREQ" "Node.js not found" "ERROR"
        throw "Node.js is required but not installed"
    }
    
    # Check AWS credentials
    try {
        $callerIdentity = aws sts get-caller-identity --query 'Account' --output text
        Write-ProgressLog "PREREQ" "AWS Account: $callerIdentity" "SUCCESS"
    }
    catch {
        Write-ProgressLog "PREREQ" "AWS credentials not configured" "ERROR"
        throw "AWS credentials are required but not configured"
    }
}

# Function to deploy infrastructure (Week 1-2)
function Deploy-Infrastructure {
    if ($SkipInfrastructure) {
        Write-ProgressLog "INFRA" "Skipping infrastructure deployment" "WARNING"
        return
    }
    
    Write-ProgressLog "INFRA" "Starting infrastructure deployment (Week 1-2)..."
    
    # Step 1: Create S3 backend bucket
    Write-ProgressLog "INFRA" "Creating S3 backend bucket..."
    $backendBucket = "$ProjectName-terraform-state-$Environment"
    try {
        aws s3api create-bucket --bucket $backendBucket --region $Region
        aws s3api put-bucket-versioning --bucket $backendBucket --versioning-configuration Status=Enabled
        Write-ProgressLog "INFRA" "S3 backend bucket created: $backendBucket" "SUCCESS"
    }
    catch {
        Write-ProgressLog "INFRA" "S3 bucket may already exist, continuing..." "WARNING"
    }
    
    # Step 2: Deploy Terraform infrastructure
    Write-ProgressLog "INFRA" "Deploying Terraform infrastructure..."
    Set-Location "infra/terraform/environments/$Environment"
    
    try {
        terraform init
        terraform plan -out=tfplan
        terraform apply tfplan
        Remove-Item tfplan -ErrorAction SilentlyContinue
        Write-ProgressLog "INFRA" "Terraform infrastructure deployed successfully" "SUCCESS"
    }
    catch {
        Write-ProgressLog "INFRA" "Terraform deployment failed" "ERROR"
        throw
    }
    finally {
        Set-Location $PSScriptRoot
    }
}

# Function to deploy Lambda functions (Week 3-4)
function Deploy-LambdaFunctions {
    if ($SkipLambda) {
        Write-ProgressLog "LAMBDA" "Skipping Lambda deployment" "WARNING"
        return
    }
    
    Write-ProgressLog "LAMBDA" "Starting Lambda function deployment (Week 3-4)..."
    
    # Step 1: Build Lambda function
    Write-ProgressLog "LAMBDA" "Building event processor Lambda function..."
    Set-Location "src/lambda/event-processor"
    
    try {
        npm install --production
        Write-ProgressLog "LAMBDA" "Lambda function built successfully" "SUCCESS"
    }
    catch {
        Write-ProgressLog "LAMBDA" "Lambda function build failed" "ERROR"
        throw
    }
    finally {
        Set-Location $PSScriptRoot
    }
    
    # Step 2: Package Lambda function
    Write-ProgressLog "LAMBDA" "Packaging Lambda function..."
    try {
        $lambdaZip = "src/lambda/event-processor/event-processor.zip"
        if (Test-Path $lambdaZip) {
            Remove-Item $lambdaZip
        }
        
        # Create zip file
        Compress-Archive -Path "src/lambda/event-processor/*" -DestinationPath $lambdaZip -Force
        Write-ProgressLog "LAMBDA" "Lambda function packaged successfully" "SUCCESS"
    }
    catch {
        Write-ProgressLog "LAMBDA" "Lambda function packaging failed" "ERROR"
        throw
    }
    
    # Step 3: Deploy Lambda function
    Write-ProgressLog "LAMBDA" "Deploying Lambda function to AWS..."
    try {
        $functionName = "$Environment-event-processor"
        
        # Check if function exists
        $functionExists = aws lambda get-function --function-name $functionName 2>$null
        
        if ($functionExists) {
            # Update existing function
            aws lambda update-function-code --function-name $functionName --zip-file "fileb://$lambdaZip"
            Write-ProgressLog "LAMBDA" "Lambda function updated successfully" "SUCCESS"
        } else {
            # Create new function
            $roleArn = aws iam get-role --role-name "$Environment-lambda-execution-role" --query 'Role.Arn' --output text
            aws lambda create-function `
                --function-name $functionName `
                --runtime nodejs18.x `
                --role $roleArn `
                --handler index.handler `
                --zip-file "fileb://$lambdaZip" `
                --timeout 30 `
                --memory-size 256 `
                --environment Variables="{EVENTS_TABLE='$Environment-events',EVENT_BUS_NAME='$Environment-event-bus',EVENT_QUEUE_URL='https://sqs.$Region.amazonaws.com/$callerIdentity/$Environment-event-queue',NOTIFICATION_TOPIC_ARN='arn:aws:sns:$Region:$callerIdentity:$Environment-notifications',ENVIRONMENT='$Environment'}"
            
            Write-ProgressLog "LAMBDA" "Lambda function created successfully" "SUCCESS"
        }
    }
    catch {
        Write-ProgressLog "LAMBDA" "Lambda function deployment failed" "ERROR"
        throw
    }
}

# Function to test the platform (Week 5-6)
function Test-Platform {
    if ($SkipTesting) {
        Write-ProgressLog "TEST" "Skipping platform testing" "WARNING"
        return
    }
    
    Write-ProgressLog "TEST" "Starting platform testing (Week 5-6)..."
    
    # Step 1: Get API Gateway URL
    Write-ProgressLog "TEST" "Getting API Gateway URL..."
    try {
        $apiUrl = aws apigateway get-rest-apis --query "items[?name=='$Environment-api'].id" --output text
        $invokeUrl = "https://$apiUrl.execute-api.$Region.amazonaws.com/$Environment/events"
        Write-ProgressLog "TEST" "API Gateway URL: $invokeUrl" "SUCCESS"
    }
    catch {
        Write-ProgressLog "TEST" "Failed to get API Gateway URL" "ERROR"
        throw
    }
    
    # Step 2: Test event ingestion
    Write-ProgressLog "TEST" "Testing event ingestion..."
    try {
        $testEvent = @{
            eventType = "user.login"
            eventSource = "web-application"
            data = @{
                userId = "test-user-123"
                timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                ipAddress = "192.168.1.1"
                userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            metadata = @{
                testRun = $true
                deploymentPhase = "phase1"
            }
        }
        
        $headers = @{
            "Content-Type" = "application/json"
        }
        
        $response = Invoke-RestMethod -Uri $invokeUrl -Method POST -Body ($testEvent | ConvertTo-Json -Depth 10) -Headers $headers
        
        if ($response.success) {
            Write-ProgressLog "TEST" "Event ingestion test successful. Event ID: $($response.eventId)" "SUCCESS"
        } else {
            Write-ProgressLog "TEST" "Event ingestion test failed: $($response.message)" "ERROR"
            throw "Event ingestion test failed"
        }
    }
    catch {
        Write-ProgressLog "TEST" "Event ingestion test failed: $($_.Exception.Message)" "ERROR"
        throw
    }
    
    # Step 3: Test DynamoDB
    Write-ProgressLog "TEST" "Testing DynamoDB..."
    try {
        $tableName = "$Environment-events"
        $tableStatus = aws dynamodb describe-table --table-name $tableName --query 'Table.TableStatus' --output text
        if ($tableStatus -eq "ACTIVE") {
            Write-ProgressLog "TEST" "DynamoDB table is active" "SUCCESS"
        } else {
            Write-ProgressLog "TEST" "DynamoDB table status: $tableStatus" "WARNING"
        }
    }
    catch {
        Write-ProgressLog "TEST" "DynamoDB test failed" "ERROR"
        throw
    }
    
    # Step 4: Test EventBridge
    Write-ProgressLog "TEST" "Testing EventBridge..."
    try {
        $eventBusName = "$Environment-event-bus"
        $eventBus = aws events describe-event-bus --name $eventBusName
        Write-ProgressLog "TEST" "EventBridge bus is active" "SUCCESS"
    }
    catch {
        Write-ProgressLog "TEST" "EventBridge test failed" "ERROR"
        throw
    }
    
    # Step 5: Test SQS
    Write-ProgressLog "TEST" "Testing SQS..."
    try {
        $queueName = "$Environment-event-queue"
        $queueUrl = aws sqs get-queue-url --queue-name $queueName --query 'QueueUrl' --output text
        Write-ProgressLog "TEST" "SQS queue is active: $queueUrl" "SUCCESS"
    }
    catch {
        Write-ProgressLog "TEST" "SQS test failed" "ERROR"
        throw
    }
}

# Function to validate monitoring (Week 7-8)
function Test-Monitoring {
    Write-ProgressLog "MONITOR" "Validating monitoring setup (Week 7-8)..."
    
    # Step 1: Check CloudWatch dashboards
    Write-ProgressLog "MONITOR" "Checking CloudWatch dashboards..."
    try {
        $dashboardName = "$Environment-platform-dashboard"
        $dashboard = aws cloudwatch describe-dashboards --dashboard-names $dashboardName
        Write-ProgressLog "MONITOR" "CloudWatch dashboard exists" "SUCCESS"
    }
    catch {
        Write-ProgressLog "MONITOR" "CloudWatch dashboard not found" "WARNING"
    }
    
    # Step 2: Check CloudWatch alarms
    Write-ProgressLog "MONITOR" "Checking CloudWatch alarms..."
    try {
        $alarms = aws cloudwatch describe-alarms --alarm-names-prefix $Environment
        $alarmCount = ($alarms.MetricAlarms | Measure-Object).Count
        Write-ProgressLog "MONITOR" "Found $alarmCount CloudWatch alarms" "SUCCESS"
    }
    catch {
        Write-ProgressLog "MONITOR" "CloudWatch alarms check failed" "WARNING"
    }
    
    # Step 3: Check X-Ray
    Write-ProgressLog "MONITOR" "Checking X-Ray..."
    try {
        $xrayGroups = aws xray get-groups --group-names "$Environment-platform"
        Write-ProgressLog "MONITOR" "X-Ray group exists" "SUCCESS"
    }
    catch {
        Write-ProgressLog "MONITOR" "X-Ray group not found" "WARNING"
    }
}

# Function to generate deployment report
function New-DeploymentReport {
    Write-ProgressLog "REPORT" "Generating deployment report..."
    
    $endTime = Get-Date
    $duration = $endTime - $StartTime
    
    $report = @{
        deploymentDate = $StartTime.ToString("yyyy-MM-dd HH:mm:ss")
        environment = $Environment
        region = $Region
        duration = $duration.ToString("hh\:mm\:ss")
        status = "SUCCESS"
        components = @{
            infrastructure = -not $SkipInfrastructure
            lambda = -not $SkipLambda
            testing = -not $SkipTesting
        }
    }
    
    $reportPath = "reports/phase1-deployment-$Environment-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    New-Item -ItemType Directory -Path "reports" -Force | Out-Null
    $report | ConvertTo-Json -Depth 10 | Out-File -FilePath $reportPath -Encoding UTF8
    
    Write-ProgressLog "REPORT" "Deployment report saved to: $reportPath" "SUCCESS"
    
    return $report
}

# Main execution
try {
    Write-ProgressLog "START" "Phase 1 deployment started"
    
    # Step 1: Check prerequisites
    Test-Prerequisites
    
    # Step 2: Deploy infrastructure (Week 1-2)
    Deploy-Infrastructure
    
    # Step 3: Deploy Lambda functions (Week 3-4)
    Deploy-LambdaFunctions
    
    # Step 4: Test platform (Week 5-6)
    Test-Platform
    
    # Step 5: Validate monitoring (Week 7-8)
    Test-Monitoring
    
    # Step 6: Generate report
    $report = New-DeploymentReport
    
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "✅ Phase 1 Implementation Completed Successfully!" -ForegroundColor Green
    Write-Host "Environment: $Environment" -ForegroundColor Yellow
    Write-Host "Duration: $($report.duration)" -ForegroundColor Yellow
    Write-Host "Status: $($report.status)" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Cyan
    
    Write-Host "Next Steps:" -ForegroundColor Blue
    Write-Host "1. Review CloudWatch dashboards for monitoring" -ForegroundColor White
    Write-Host "2. Test event processing with different event types" -ForegroundColor White
    Write-Host "3. Configure additional alerting as needed" -ForegroundColor White
    Write-Host "4. Begin Phase 2 planning and implementation" -ForegroundColor White
}
catch {
    Write-ProgressLog "ERROR" "Phase 1 deployment failed: $($_.Exception.Message)" "ERROR"
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "❌ Phase 1 Implementation Failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup
    if (Test-Path "src/lambda/event-processor/event-processor.zip") {
        Remove-Item "src/lambda/event-processor/event-processor.zip" -Force
    }
}
