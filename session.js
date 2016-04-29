(function() {
    
    function Session(event) {
        // load chrome.storage.local settings
        // (maybe resume.dat file from PERSISTENT isolated storage)
        // setup listen for gcm messages if setting wants it.
        this.id = 'app01'
        this.options = null
        this.permissions = null
        this.notifications = new jstorrent.Notifications
        this.events = [event]
        this.ready = false
        this.launching = false
        this.eventData = null
        this.wantsUI = false
        this.thinking = null

        this.analytics = false
        this.client = false
        this[MAINWIN] = false
        
        async.parallel( [ this.getPermissions.bind(this),
                          this.getOptions.bind(this) ],
                        this.onReady.bind(this))
    }
    SessionProto = {
        onWindowClosed: function(id) {
            console.clog(L.SESSION,'window closed',id)
            this[id] = null
            if (id == MAINWIN) {
                this.UI = null
            }
        },
        notify: function(msg, prio) {
            console.log('app notify',msg,'prio',prio)
            if (this.client && this.client.fgapp) {
                this.client.fgapp.notify(msg,prio)
            }
        },
        createNotification: function(opts) {
            console.log('create notification',opts)
            if (this.client && this.client.fgapp) {
                this.client.fgapp.createNotification(opts)
            }
        },
        shutdown: function() {
            this.analytics = null
            this.UI = null
            if (this.client) {
                this.client.fgapp = null
            }
            this.client = null
            
            var cwin = chrome.app.window.get('client')
            if (cwin) cwin.close()
            var awin = chrome.app.window.get('analytics')
            if (awin) awin.close()
            console.log(this.thinking)
            if (this.thinking) {
                clearInterval(this.thinking)
                this.thinking = null
            }
        },
        addListener: function(t,cb) {
            if (! this._listeners[t]) this._listeners[t] = []
            this._listeners[t].push(cb)
        },
        trigger: function(t) {
            var cbs = this._listeners[t]
            if (cbs) cbs.forEach( function(cb){cb()} )
        },
        registerEvent: function(event) {
            console.clog(L.SESSION,'register event',event)
            if (this.ready && ! this.launching) {
                this.runEvent(event)
            } else {
                this.events.push(event)
            }
        },
        getPermissions: function(cb) {
            chrome.permissions.getAll( function(permissions) {
                this.permissions = permissions
                cb()
            }.bind(this))
        },
        getOptions: function(cb) {
            this.options = new jstorrent.Options({app:this})
            this.options.load( cb )
        },
        runEvents: function() {
            while (this.events.length >0) { // todo make async runner
                this.runEvent( this.events.shift() )
            }
        },
        onReady: function() {
            console.clog(L.SESSION,'ready')
            this.ready = true
            this.runEvents()
        },
        createClient: function() {
            if (! this.client) {
                this.client = true
                var id = 'client'
                chrome.app.window.create('gui/client.html',
                                         {id:id,
                                          hidden:true},
                                         function(win){
                                             win.onClosed.addListener(this.onWindowClosed.bind(this,id))
                                         }.bind(this))
            }
        },
        createAnalytics: function() {
            if (! this.analytics) {
                this.analytics = true
                var id = 'analytics'
                chrome.app.window.create('gui/analytics.html',
                                         {id:id,
                                          hidden:true},
                                         function(win){
                                             win.onClosed.addListener(this.onWindowClosed.bind(this,id))
                                         }.bind(this))
            }
        },
        createUI: function() {
            if (! this[MAINWIN]) {
                var id = MAINWIN
                this[MAINWIN]=true
                chrome.app.window.create('gui/ui.html',
                                         {id:id},
                                         function(win){
                                             win.onClosed.addListener(this.onWindowClosed.bind(this,id))
                                         }.bind(this))
            }
        },
        onClientPageInit: function(win) {
            console.clog(L.SESSION,'client page created client',win.client)
            this.client = win.client
            if (this.wantsUI) {
                this.createUI()
            } else {
                this.launchDone()
            }
        },
        onAnalyticsPageInit: function(win) {
            console.clog(L.SESSION,'analytics page ready',win.jsanalytics)
            this.analytics = win.jsanalytics
            this.createClient()
        },
        onUIPageInit: function(win) {
            console.clog(L.SESSION,'UI page ready')
            this[MAINWIN] = true
            this.launchDone()
        },
        launchDone: function() {
            console.log('launchdone',this.eventData)
            this.launching = false
            this.client.handleLaunchData(this.eventData)
            this.eventData = null
            this.runEvents()
        },
        launch: function(data) {
            if (! this.thinking) {
                this.thinking = setInterval(this.think.bind(this), 10000)
            }
            if (this.launching) { return }
            this.launching = true
            if (this[MAINWIN]) {
                // have all windows already
                this.launchDone()
            } else if (this.wantsUI && this.analytics && this.client) {
                this.createUI()
            } else {
                this.createAnalytics()
            }
        },
        think: function() {
            //console.clog(L.SESSION,'think')
            if (this.client && this.client.activeTorrents.items.length == 0 && ! chrome.app.window.get(MAINWIN)) {
                console.clog(L.SESSION,'shut it down.')
                this.shutdown()
            }
        },
        runEvent: function(event) {
            this.eventData = event
            console.clog(L.SESSION,'run event',event)
            switch(event.type) {
            case 'onMessageExternal':
                this.launch(event)
                break;
            case 'onLaunched':
                this.wantsUI = true
                console.log('wants UI')
                this.launch(event)
                break;
            case 'onInstalled':
                if (this.options.get('start_in_background')) {
                    this.launch(event)
                }
                break
            }
        }
    }
    for (var m in SessionProto) Session.prototype[m] = SessionProto[m]
    jstorrent.Session = Session
})()