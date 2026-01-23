FROM python:3.12-slim

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy requirements
COPY requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src ./src
COPY tests ./tests
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN set -eux; \
    if ! getent group 1000 >/dev/null; then groupadd -g 1000 app; fi; \
    if ! id -u 1000 >/dev/null 2>&1; then useradd -m -u 1000 -g 1000 app; fi; \
    mkdir -p /data /seed; \
    chown -R 1000:1000 /app /data /seed
USER 1000:1000
# Expose port
EXPOSE 8001

# Start the application
# Using port 8001 to match docker-compose configuration
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
