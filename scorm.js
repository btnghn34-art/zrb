var Scorm = {
    API: null,
    initialized: false,

    findAPI: function(win) {
        var findAPITries = 0;
        while ((win.API == null) && (win.parent != null) && (win.parent != win)) {
            findAPITries++;
            if (findAPITries > 7) {
                return null;
            }
            win = win.parent;
        }
        return win.API;
    },

    getAPI: function() {
        var theAPI = this.findAPI(window);
        if ((theAPI == null) && (window.opener != null) && (typeof(window.opener) != "undefined")) {
            theAPI = this.findAPI(window.opener);
        }
        if (theAPI == null) {
            console.warn("SCORM API bulunamadı.");
        }
        return theAPI;
    },

    init: function() {
        this.API = this.getAPI();
        if (this.API) {
            var result = this.API.LMSInitialize("");
            if (result.toString() === "true") {
                this.initialized = true;
                this.API.LMSSetValue("cmi.core.lesson_status", "incomplete");
                this.API.LMSCommit("");
                console.log("SCORM başlatıldı.");
            }
        }
    },

    complete: function(score) {
        if (this.initialized && this.API) {
            this.API.LMSSetValue("cmi.core.score.raw", score);
            this.API.LMSSetValue("cmi.core.lesson_status", "completed");
            this.API.LMSCommit("");
            console.log("Ders tamamlandı olarak işaretlendi. Skor:", score);
        }
    },

    finish: function() {
        if (this.initialized && this.API) {
            this.API.LMSFinish("");
            this.initialized = false;
        }
    }
};

window.Scorm = Scorm;