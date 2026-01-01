# Quick Start Guide

## 🎯 Get Running in 5 Minutes

### Step 1: Build (First time only - takes 15 minutes)
```bash
cd task-processing-system
make build
```

**What's happening:**
- Downloading Zookeeper, Kafka, RabbitMQ source code
- Compiling from source
- Creating Docker images
- Go get coffee ☕ - this takes ~15 minutes first time

### Step 2: Start Everything
```bash
make up
```

**What's happening:**
- Starting Zookeeper
- Starting Kafka (waits for Zookeeper to be healthy)
- Starting RabbitMQ
- Starting Kafka UI
- Takes ~60 seconds

### Step 3: Verify It's Working
```bash
make health
```

You should see all services "healthy".

### Step 4: Open the UIs
```bash
# Kafka UI
make ui-kafka
# Or visit: http://localhost:8080

# RabbitMQ UI  
make ui-rabbitmq
# Or visit: http://localhost:15672
# Login: admin / admin
```

---

## ✅ Checklist

- [ ] Containers built successfully
- [ ] All services started
- [ ] All services healthy
- [ ] Kafka UI opens in browser
- [ ] RabbitMQ UI opens and you can login

---

## 🧪 Test It Works

### Test Kafka
```bash
# In one terminal, watch Kafka logs
make logs-kafka

# In another terminal, enter the Kafka container
docker exec -it kafka bash

# Create a test topic
bin/kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic test \
  --partitions 3 \
  --replication-factor 1

# Send a message
echo "Hello Kafka!" | bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic test

# Read the message
bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic test \
  --from-beginning

# Exit
exit
```

You should see "Hello Kafka!" appear!

### Test RabbitMQ
1. Open http://localhost:15672 (admin/admin)
2. Click "Queues" tab
3. Click "Add a queue"
4. Name it "test-queue"
5. Click "Add queue"
6. You should see your queue appear!

---

## 📝 Your First Integration Test

Create a file `test-kafka.js`:

```javascript
const { Kafka } = require('kafkajs');

async function test() {
  const kafka = new Kafka({
    clientId: 'test-app',
    brokers: ['localhost:9092']
  });

  const producer = kafka.producer();
  await producer.connect();

  console.log('✅ Connected to Kafka');

  await producer.send({
    topic: 'test',
    messages: [{
      key: 'test-key',
      value: JSON.stringify({
        message: 'Hello from Node.js!',
        timestamp: new Date()
      })
    }]
  });

  console.log('✅ Message sent');

  await producer.disconnect();
}

test().catch(console.error);
```

Run it:
```bash
npm install kafkajs
node test-kafka.js
```

Check Kafka UI - you should see your message in the "test" topic!

---

## 🎉 Success!

If all the above worked, you're ready to build your task processing system!

---

## 🛑 When You're Done

```bash
# Stop everything (keeps data)
make down

# Or delete everything (fresh start next time)
make clean
```

---

## 🆘 Something Wrong?

```bash
# Check status
make status

# Check health
make health

# View logs
make logs

# Still stuck? Try a clean restart
make clean
make build
make up
```

---

## 📚 Next Steps

1. Read the [main README](README.md) for detailed explanations
2. Study the Dockerfiles to understand the build process
3. Read the config files to understand how things are configured
4. Start building your NestJS application!

**Remember:** Every file has detailed comments. Read them! 📖