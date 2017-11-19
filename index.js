require('colors')
const fs = require('fs')
const natural = require('natural')
const express = require('express')
const request = require('request')
const bodyParser = require('body-parser')
const app = express().use(bodyParser.json())
let port = process.env.PORT || 80

let topics = require('./data/topics.json')

let imagesURL = 'https://css3-bot.herokuapp.com/images/'
let VERIFY_TOKEN = 'ayylmao'
let pageAcessToken = 'EAAWjxAlEm7YBABmsTgoCqDfSNm1sA8BHrO6KJctgZAJued2XeaNfGkV9LTeUD5XZCiImWJilweO1D5TanYWsmq05ngZADXDMD3RL4ifpQzcaeHZC3MDTqc3wP6delSR2bMwLWZCE3YdL6XQ5zOxHJqfHZAOgJKRZCdLi6qKCHCNoQZDZD'
let profileAPI = 'https://graph.facebook.com/v2.6/me/messenger_profile'
let messageAPI = 'https://graph.facebook.com/v2.6/me/messages'
let uploadAPI =  'https://graph.facebook.com/v2.6/me/message_attachments'

// text classification

// TODO: handle messeages like: "how to ..", "show me tips for navigations"
// class: [sentences]
let training_data = {
  tip: [
    "how to do",
    "how to make",
    "how can i make",
    "how can i do",
    "i want to make",
    "i wanna make",
    "i want to do",
    "i wanna do"
  ],
  topic: [
    "show me tips for",
    "i wanna know about",
    "i wanna learn about",
    "i want to know about",
    "i want to learn about",
    "teach me about"
  ],
  greeting: [
    "hello",
    "hi",
    "hey there",
    "whats up"
  ]
}

let strDist = (str, str2)  => {
  return natural.LevenshteinDistance(str, str2, {insertion_cost: 1, deletion_cost: 1, substitution_cost: 1})
}
let stem = natural.LancasterStemmer.stem
let classifier = new natural.BayesClassifier()
let tokenizer = new natural.WordTokenizer()
let stemStr = str => {
  return tokenizer.tokenize(str)
    .map(word => {
      return stem(word)
    })
    .join(' ')
}

// console.log(strDist(stemStr("Make images responsive"),stemStr('how to make an image responsive?')));
// console.log(strDist(stemStr('how to center an image horizontally?'), stemStr('Center text/images horizontally')));
// console.log(strDist('not', 'same at all'));
// console.log(strDist('The RainCoat BookStore', 'All the best books are here at the Rain Coats Book Store'));

for (const sClass in training_data) {
  let arr = training_data[sClass]
  arr.forEach(sentence => {
    let stemmed = tokenizer.tokenize(sentence)
      .map(word => {
        return stem(word)
      })
    // console.log('add document: ' + sClass + ' --> ' + stemmed)
    classifier.addDocument(stemmed, sClass)
  })
}

classifier.train()

// test cases
// console.log(1, classifier.classify('how to make images responsive?'))
// console.log(2, classifier.classify('i want to make images responsive?'))
// console.log(3, classifier.classify('show me tips for animations'))
// console.log(4, classifier.classify('i want to see tips for animations'))
// console.log(5, classifier.classify('i wanna make images responsive?'))
// console.log(6, classifier.classify('how can i make a paralex page?'))
// console.log(7, classifier.classify('i wanna learn about drop down navigations'))
// console.log(8, classifier.classify('no fucking with hues'))
// console.log(9, classifier.classify('make me a sandwich now'));

// -------------------

app.get('/', function (req, res) {
  res.send('m.me/css3bot')
})

// serve images
app.get('/images/:folder/:img', function (req, res) {
  let img = req.params.img
  let folder = req.params.folder
  res.sendFile(`${__dirname}/images/${folder}/${img}`)
})

// serve default image
app.get('/images/:img', function (req, res) {
  let img = req.params.img
  res.sendFile(`${__dirname}/images/${img}`)
})


// Set welcome screen
request({
  uri: profileAPI,
  qs: {access_token: pageAcessToken},
  method: 'POST',
  json: {
    "get_started": {
      "payload": "start_convo"
    },
    "greeting":[
      {
        "locale":"default",
        "text":"Useful CSS tips, tricks and how tos"
      }
    ]
  }
}, err => {
  if (err)
    console.error('Can\'t set welcome screen: ' + err);
})

let bot = {
  getRandomTopics: () => {
    let arr = Object.keys(topics)
    let randomTopics = []
    let i = 4

    while (randomTopics.length < i) {
      let rTopic = arr[Math.floor(Math.random() * (arr.length ))]
      if (randomTopics.indexOf(rTopic) < 0)
        randomTopics.push(rTopic)
    }

    return randomTopics
  },

  getRandomTips: (topic) => {
    let randomTips = []
    let i = 3

    while (randomTips.length < i) {
      let tip = topics[topic][Math.floor(Math.random() * (topics[topic].length ))]
      if (randomTips.indexOf(tip) < 0)
        randomTips.push(tip)
    }

    return randomTips
  },
  
  createQuickReplies: (arr) => {
    let replies = []
    for (let i = 0; i < arr.length; i++) {
      let textArr = arr[i].split('')
      textArr[0] = textArr[0].toUpperCase()
      let capitalized = textArr.join('')

      replies.push({
        content_type: 'text',
        title: capitalized,
        payload: 'topic:' + arr[i]
      })
    }
    return replies
  },

  createCarousel: (topic) => {
    let attachment = {
      type: 'template',
      payload: {
        template_type: 'generic',
        image_aspect_ratio: 'square',
        elements: []
      }
    }
    
    bot.getRandomTips(topic)
      .forEach(tip => {
        if (tip.images[0]) {
          var img_url = `${ imagesURL + topic }/` + tip.images[0]
        } else {
          var img_url = `${imagesURL}default.jpg`
        }


        let box = {
          title: tip.name,
          subtitle: tip.source? 'Source: ' + tip.source : '',
          image_url: img_url,
          buttons: [
            {
              type: 'postback',
              title: 'Show Code Snippet',
              payload: `tip:${tip.name}`
            }
          ]
        }
        attachment.payload.elements.push(box)
      })

    return attachment
  },

  saveImage: (url) => {
    bot.callSendAPI(null, {
      attachment: {
        type: 'image',
        payload: {
          is_reusable: true,
          url: url
        }
      }
    }, null, true)
  },

  handleMessage: (sender, msg) => {
    let response = {}
    if (msg.quick_reply) {
      let topic = msg.quick_reply.payload.split(':')[1]
      response.attachment = bot.createCarousel(topic)

    } else if (msg.text) {
      console.log(`${sender.green}: ${msg.text}`)
      
      let iclass = classifier.classify(msg.text)
      let stemmedMsg = stemStr(msg.text)
      let results = []

      if (iclass == 'tip') {
        let leastDistance = Number.MAX_VALUE
        let closestTipMatchI
        let closestTopic

        for (const topic in topics) {
          let tips = topics[topic]

          for (let i = 0; i < tips.length; i++) {
            let dist = strDist(stemStr(tips[i].name), stemmedMsg)
            if ( dist < leastDistance ) {
              leastDistance = dist
              closestTipMatchI = i
              closestTopic = topic
            }
          }
        }

        if (closestTipMatchI || closestTipMatchI == 0) {
          results.push(topics[topic][closestTipMatchI].name)
        } else {
          results.push('no results!')
        }

      } else if (iclass == 'topic') {

        for (const topic in topics) {
          if ( stemmedMsg.includes(stem(topic)) ) {
            results.push(topic)
            break
          }
        }

      } else if (iclass == 'greeting') {
        results.push('hello human!')
      }

      response.text = 'my response: ' + results.join(', ')
      // response.attachment = bot.createCarousel('layout')


      
      if (!response.text && !response.attachment) {
        // response.text = "Sorry, i don't know that, try another question?"
        response.attachment = {
          type: 'image',
          payload: {
            attachment_id: '1971336836487309'
          }
        }
      }
      
    } else if (msg.attachments) {
      response.text = "Cool. ✌🏼"
    }
    
    let typingTime = 2000;
    
    bot.callSendAPI(sender, 'action', 'mark_seen')
    bot.callSendAPI(sender, 'action', 'typing_on')
    setTimeout(() => {
      // response.sender_action = 'typing_off'
      bot.callSendAPI(sender, response)
    }, typingTime);
    
    
  },

  handlePostback: (sender, postback) => {
    console.log('postback event ' + postback.payload)
    if (postback.payload == 'start_convo')
      bot.newConversation(sender)
  },

  newConversation: (sender) => {
    request({
      uri: `https://graph.facebook.com/v2.6/${sender}`,
      qs: {access_token: pageAcessToken, fields: 'first_name'},
      method: 'GET'
    }, (err, res, body) => {
      if (err)
        console.error('Error getting profile data: ' + err)

      body = JSON.parse(body)

      let msg = {
        text: `Hello ${body.first_name}! i can show you neat CSS tips and tricks on the fly, you can ask me:
e.g "How to make images responsive?"
e.g "How can i center an element vertically?"
e.g "Show me tips to for parallax effects"
e.g "I want to learn CSS3 animations"`
      }

      let msg2 = {
        text: `What do you wanna learn about right now?`,
        quick_replies: bot.createQuickReplies(bot.getRandomTopics())
      }

      setTimeout(function() {
        bot.callSendAPI(sender, msg)
        setTimeout(() => {
          bot.callSendAPI(sender, 'action', 'typing_on')
        }, 500);
      }, 2000)

      setTimeout(() => {
        bot.callSendAPI(sender, msg2)
      }, 6500);
    })
  },

  callSendAPI: (target, message, action, isFile) => {
    let data = {}
    if (target) {
      data.recipient = {
        id: target
      }
    }

    if (message === 'action') {
      data.sender_action = action
    } else {
      data.message = message
    }
    
    request({
      uri: isFile? uploadAPI : messageAPI,
      qs: {"access_token": pageAcessToken},
      method: 'POST',
      json: data
    }, (err, res, body) => {
      if (err)
        console.error('Error sending message: '.red + err)
      if (res && res.body.error)
        console.error(res.body.error);
      if (res && res.body && res.body.attachment_id)
        console.log('Asset saved: '.green + res.body.attachment_id);
    })
  }
}

app.get('/app', function (req, res) {
  let challenge = req.query['hub.challenge']
  let token = req.query['hub.verify_token']
  
  if (challenge && token) {
    console.log('Webhook attempt')
    if (token == VERIFY_TOKEN) {
      res.send(challenge)
      console.log('Webhook hooked'.green)
    } else {
      console.log('Webhook failed')
      res.status(401).send()
    }
  } else {
    
    console.log('GET /app Webhook Invalid attempt')
    res.status(401).send()
  }
})

// webhook event handlers
app.post('/app', function(req, res) {
  let body = req.body
  
  if (body.object === 'page') {
    body.entry.forEach(function(entry) {
      if (!entry.messaging)
      return res.status(200).send()
      let webhook_event = entry.messaging[0]
      
      let sender = webhook_event.sender.id
      
      if (webhook_event.message) {
        bot.handleMessage(sender, webhook_event.message)
        
      } else if (webhook_event.postback) {
        bot.handlePostback(sender, webhook_event.postback)
      }
      
    })
    res.status(200).send('EVENT_RECEIVED')
  } else {
    res.status(401).send()
  }
})

app.listen(port, function () {
  console.log(`Server running on port ${port}`.green)
})