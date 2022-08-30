var cron = require("node-cron")
const https = require("https")
const express = require("express")
const mysql = require("mysql")
const app = express()
const PORT = process.env.PORT || 3000
const TOKEN =
  process.env.LINE_ACCESS_TOKEN ||
  "ud4p+TnCu5yf3DZBZgVGLlGxUbbYkKdwmdowHyRTZ7wUcmqevx6AwkHrqDCJ6iLyQByhEk3zrRtEDn6MORyqzaPL+B9MQGEhLKIDzFKKo9oluTxDIiOLq/bXsFoMfdCELX9TeCxanRsQCeceNdMkaQdB04t89/1O/w1cDnyilFU="

cron.schedule(
  "30 16 * * */1-6",
  async () => {
    notificationLine()
  },
  {
    scheduled: true,
    timezone: "Asia/Bangkok",
  }
)

cron.schedule(
  "35 13 * * */1-6",
  async () => {
    notificationLine()
  },
  {
    scheduled: true,
    timezone: "Asia/Bangkok",
  }
)

cron.schedule(
  "30 11 * * */1-6",
  async () => {
    notificationLine()
  },
  {
    scheduled: true,
    timezone: "Asia/Bangkok",
  }
)

async function notificationLine() {
  console.log("running a task every date in time 11:30 : 16:30")
  const newDate = new Date()
  const planDate = newDate.toLocaleDateString("af-ZA") + "%"
  const actionDate = planDate
  const curTime = new Date().toLocaleTimeString("th-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  })
  const connection = mysql.createConnection({
    host: "bauto-schema.cfnxq6b0ia8q.ap-southeast-1.rds.amazonaws.com",
    port: 3306,
    user: "admin",
    password: "Technician2020!",
    database: "erp_schema",
    ssl: true,
  })
  const queryProduction = "SELECT * FROM productionplan where `planDate` LIKE ?"
  const queryTestScanner =
    "SELECT sum(quantity) as sum , process, partNo, machine FROM testscanner where `actionDate` like ? group by partNo,machine,process"

  connection.query(queryProduction, planDate, (err, rows, fields) => {
    if (!err) {
      const lines = [...new Set(rows.map((e) => e.line))]
      const newPlanCurDates = []
      for (const line of lines) {
        const maxRevision = rows
          .filter((e) => e.line === line)
          .map((e) => e.revision)
          .reduce((prev, cur) => {
            return cur > prev ? cur : prev
          })
        const filterPlanCurDate = rows.filter(
          (e) =>
            e.line === line &&
            e.revision === maxRevision &&
            e.pdPlan === "แผนหลัก" &&
            calculateTime(curTime) - calculateTime(e.startTime) > 3.5
        )
        newPlanCurDates.push(...filterPlanCurDate)
      }
      connection.query(queryTestScanner, actionDate, (err, rows, fields) => {
        if (!err) {
          const filterPlanAndTestScanner = newPlanCurDates.filter(
            (newPlanCurDate) => {
              return !rows.find((testScanner) => {
                return (
                  testScanner.partNo === newPlanCurDate.partNo &&
                  testScanner.machine === newPlanCurDate.machine &&
                  testScanner.process === newPlanCurDate.step
                )
              })
            }
          )
          queryProblemMachine(filterPlanAndTestScanner, actionDate, connection)
        } else {
          console.log(err)
        }
      })
    } else {
      console.log(err)
    }
  })
}

function calculateTime(time) {
  if (!time) return 0
  const timeSplit = time.split(":")
  return Number(
    (Number(timeSplit[0]) + (Number(timeSplit[1]) * 100) / 60 / 100).toFixed(2)
  )
}

function queryProblemMachine(data, actionDate, connection) {
  const queryProblemMachine =
    "SELECT * FROM machineproblem where `actionDate` like ? group by machine,partNo,process"
  connection.query(queryProblemMachine, actionDate, (err, rows, fields) => {
    if (!err) {
      const filterProblemMachine = data.filter((newPlanCurDate) => {
        return !rows.find((problemMachine) => {
          return (
            problemMachine.partNo === newPlanCurDate.partNo &&
            problemMachine.machine === newPlanCurDate.machine &&
            problemMachine.process === newPlanCurDate.process
          )
        })
      })
      userLine(filterProblemMachine)
    } else {
      console.log(err)
    }
    connection.end()
  })
}

function userLine(data) {
  const connection = mysql.createConnection({
    host: "bauto-schema.cfnxq6b0ia8q.ap-southeast-1.rds.amazonaws.com",
    port: 3306,
    user: "admin",
    password: "Technician2020!",
    database: "erp_schema",
    ssl: true,
  })
  const queryLine = "SELECT userId FROM erp_schema.lineusers"
  connection.query(queryLine, (err, rows, fields) => {
    if (!err) {
      const userId = rows.map((e) => e.userId)
      sendLine(data, userId)
    } else {
      console.log(err)
    }
    connection.end()
  })
}

function sendLine(data, userLine) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + TOKEN,
  }

  const message = []
  let i = 0
  console.log(data.length)
  for (const rawData of data) {
    const tempMessageMachine = {
      type: "box",
      layout: "baseline",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: `${i + 1}`,
          color: "#666666",
          size: "sm",
          flex: 1,
        },
        {
          type: "text",
          text: `M/C: ${rawData.machine} 
  Part: ${rawData.partNo}`,
          wrap: true,
          color: "#666666",
          size: "sm",
          flex: 5,
        },
      ],
    }
    message.push(tempMessageMachine)
    i++
  }
  const timeMessage = {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: "Time",
        color: "#aaaaaa",
        size: "sm",
        flex: 2,
      },
      {
        type: "text",
        text: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        wrap: true,
        color: "#666666",
        size: "sm",
        flex: 5,
      },
    ],
  }
  message.push(timeMessage)

  const raw = JSON.stringify({
    to: userLine,
    messages: [
      {
        type: "flex",
        altText: "แจ้งเตือนเครื่องจักรไม่มีการเคลื่อนไหว",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "แจ้งเตือนเครื่องจักรไม่มีการเคลื่อนไหว",
                weight: "bold",
                size: "lg",
              },
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: message,
              },
            ],
          },
        },
      },
    ],
  })

  const webhookOptions = {
    hostname: "api.line.me",
    path: "/v2/bot/message/multicast",
    method: "POST",
    headers: headers,
    body: raw,
  }

  const request = https.request(webhookOptions, (res) => {
    res.on("data", (d) => {
      process.stdout.write(d)
    })
  })

  // Handle error
  request.on("error", (err) => {
    console.error(err)
  })
  // Send data

  request.write(raw)
  console.log(success)
  request.end()
}
