# Infrastructure Deployment Script
# Event-Driven Microservices Platform
# Phase 1 Implementation

param(
    [Parameter(Mandatory=$true)]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1",
    
    [Parameter(Mandatory=$false)]
    [switch]$Destroy
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Script variables
$ProjectName = "event-driven-platform"
$TerraformDir = "terraform/environments/$Environment"
$BackendBucket = "$ProjectName-terraform-state-$Environment"

Write-Host "🚀 Starting Phase 1 Infrastructure Deployment" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host "Project: $ProjectName" -ForegroundColor Yellow

# Function to check AWS CLI
function Test-AWSCLI {
    Write-Host "Checking AWS CLI installation..." -ForegroundColor Blue
    try {
        $awsVersion = aws --version
        Write-Host "AWS CLI found: $awsVersion" -ForegroundColor Green
    }
    catch {
        Write-Error "AWS CLI not found. Please install AWS CLI and configure it."
        exit 1
    }
}

# Function to check Terraform
function Test-Terraform {
    Write-Host "Checking Terraform installation..." -ForegroundColor Blue
    try {
        $terraformVersion = terraform --version
        Write-Host "Terraform found: $terraformVersion" -ForegroundColor Green
    }
    catch {
        Write-Error "Terraform not found. Please install Terraform >= 1.0.0."
        exit 1
    }
}

# Function to check AWS credentials
function Test-AWSCredentials {
    Write-Host "Checking AWS credentials..." -ForegroundColor Blue
    try {
        $callerIdentity = aws sts get-caller-identity --query 'Account' --output text
        Write-Host "AWS Account: $callerIdentity" -ForegroundColor Green
    }
    catch {
        Write-Error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    }
}

# Function to create S3 backend bucket
function New-S3BackendBucket {
    Write-Host "Creating S3 backend bucket for Terraform state..." -ForegroundColor Blue
    try {
        aws s3api create-bucket --bucket $BackendBucket --region $Region
        Write-Host "S3 bucket created: $BackendBucket" -ForegroundColor Green
    }
    catch {
        Write-Host "S3 bucket may already exist or creation failed. Continuing..." -ForegroundColor Yellow
    }
}

# Function to enable S3 bucket versioning
function Enable-S3BucketVersioning {
    Write-Host "Enabling S3 bucket versioning..." -ForegroundColor Blue
    try {
        aws s3api put-bucket-versioning --bucket $BackendBucket --versioning-configuration Status=Enabled
        Write-Host "S3 bucket versioning enabled" -ForegroundColor Green
    }
    catch {
        Write-Error "Failed to enable S3 bucket versioning"
        exit 1
    }
}

# Function to deploy infrastructure
function Deploy-Infrastructure {
    Write-Host "Deploying infrastructure..." -ForegroundColor Blue
    
    # Change to Terraform directory
    Set-Location $TerraformDir
    
    # Initialize Terraform
    Write-Host "Initializing Terraform..." -ForegroundColor Blue
    terraform init
    
    # Plan Terraform
    Write-Host "Planning Terraform deployment..." -ForegroundColor Blue
    terraform plan -out=tfplan
    
    # Apply Terraform
    Write-Host "Applying Terraform deployment..." -ForegroundColor Blue
    terraform apply tfplan
    
    # Clean up plan file
    Remove-Item tfplan -ErrorAction SilentlyContinue
    
    Write-Host "Infrastructure deployment completed successfully!" -ForegroundColor Green
}

# Function to destroy infrastructure
function Remove-Infrastructure {
    Write-Host "Destroying infrastructure..." -ForegroundColor Red
    
    # Change to Terraform directory
    Set-Location $TerraformDir
    
    # Initialize Terraform
    Write-Host "Initializing Terraform..." -ForegroundColor Blue
    terraform init
    
    # Plan destruction
    Write-Host "Planning infrastructure destruction..." -ForegroundColor Blue
    terraform plan -destroy -out=tfplan
    
    # Apply destruction
    Write-Host "Destroying infrastructure..." -ForegroundColor Red
    terraform apply tfplan
    
    # Clean up plan file
    Remove-Item tfplan -ErrorAction SilentlyContinue
    
    Write-Host "Infrastructure destruction completed!" -ForegroundColor Green
}

# Function to validate deployment
function Test-Infrastructure {
    Write-Host "Validating infrastructure deployment..." -ForegroundColor Blue
    
    # Test VPC
    Write-Host "Testing VPC..." -ForegroundColor Blue
    $vpcId = terraform output -raw vpc_id
    aws ec2 describe-vpcs --vpc-ids $vpcId
    
    # Test API Gateway
    Write-Host "Testing API Gateway..." -ForegroundColor Blue
    $apiUrl = terraform output -raw api_gateway_url
    Write-Host "API Gateway URL: $apiUrl" -ForegroundColor Green
    
    # Test EventBridge
    Write-Host "Testing EventBridge..." -ForegroundColor Blue
    $eventBusArn = terraform output -raw eventbridge_bus_arn
    aws events describe-event-bus --name "dev-event-bus"
    
    # Test DynamoDB
    Write-Host "Testing DynamoDB..." -ForegroundColor Blue
    $tableName = terraform output -raw dynamodb_table_name
    aws dynamodb describe-table --table-name $tableName
    
    Write-Host "Infrastructure validation completed!" -ForegroundColor Green
}

# Main execution
try {
    # Pre-flight checks
    Test-AWSCLI
    Test-Terraform
    Test-AWSCredentials
    
    # Create backend infrastructure
    New-S3BackendBucket
    Enable-S3BucketVersioning
    
    # Deploy or destroy infrastructure
    if ($Destroy) {
        Remove-Infrastructure
    } else {
        Deploy-Infrastructure
        Test-Infrastructure
    }
    
    Write-Host "✅ Phase 1 Infrastructure deployment completed successfully!" -ForegroundColor Green
}
catch {
    Write-Error "❌ Infrastructure deployment failed: $($_.Exception.Message)"
    exit 1
}
finally {
    # Return to original directory
    Set-Location $PSScriptRoot
}
