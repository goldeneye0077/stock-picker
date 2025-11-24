FROM python:3.10-slim

WORKDIR /app

# Install system dependencies if needed (e.g. for building some python packages)
# RUN apt-get update && apt-get install -y build-essential

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8001

# Start the application
# Using port 8001 to match docker-compose configuration
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
