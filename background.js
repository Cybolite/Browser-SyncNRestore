const debug = false;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveTabs") {
    saveTabs(request.name);
  } else if (request.action === "restoreTabs") {
    let data = request.data;
    try {
        data = JSON.parse(data);
    } catch (e) {
        data = atob(data);
    }
    const resp = restoreTabs(data);
    sendResponse(resp ? "Tabs Restored" : "Error Restoring Tabs");
  } else if (request.action === "closeAll") {
    closeAllExistingTabs(request.preventWinClose);
  } else if (request.action === "sync") {
    if (request.status) {
        chrome.storage.local.set({ browserSync: true } , function() {
            chrome.storage.sync.get(['browserData'], function (result) {
                debug ? console.log("Browser Restorinc") : null;
                // restoreTabs(result.browserData);
            });
        });
    } else {
        chrome.storage.local.set({ browserSync: false });
    }
  }
});


async function restoreTabs(tabData) {
    try {
        if(typeof tabData !== "object") {
            tabData = JSON.parse(tabData);
        }
        
        const windowsData = tabData.windows;
        const prevGroups = tabData.groups;
        
        let lastTab = await closeAllExistingTabs(true);
        
        let newMappedWindows = [];
        let newMappedGroups = [];

        async function createWin() {
            debug ? console.log("Window Creation Start.") : null;
            for (const win of windowsData) {
                await new Promise((resolve, reject) => {
                    debug ? console.log("Creating Window", win) : null;
                    let  winOption = {};

                    winOption.focused = win.focused;
                    winOption.incognito = win.incognito;
                    winOption.type = win.type;
                    if(win.state === "minimized" || win.state === "maximized" || win.state === "fullscreen") {
                        debug ? console.log("State", win.state) : null;
                        // winOption.state = win.state;
                    } else {
                        winOption.width = win.width;
                        winOption.height = win.height;
                        winOption.top = win.top;
                        winOption.left = win.left;
                    }
                    chrome.windows.create({
                        ...winOption
                    }).then((newWin) => {
                        debug ? console.log("Window Created", newWin) : null;
                        newMappedWindows[win.id] = newWin.id;
                        resolve();
                    });
                });
            }
        }
        
        await createWin();
        await closeTabs([lastTab]);

        async function createWinTabs() {
            for (const win of windowsData) {
                await new Promise(async (resolveW) => {
                    for (const tab of win.tabs) {
                        await new Promise((resolve) => {
                            debug ? console.log("Creating Tab", tab.url) : null;
                            chrome.tabs.create({
                                windowId: newMappedWindows[tab.windowId],
                                url: tab.url,
                                active: tab.active,
                                pinned: tab.pinned,
                                index: tab.index,
                                selected: tab.selected
                                // status: tab.status,
                                // title: tab.title
                            }).then((newTab) => {
                                debug ? console.log("Tab Created", newTab) : null;
        
                                if (tab.groupId !== -1) {
                                    // Check if groupId is not -1
                                    if(newMappedGroups[tab.groupId]) {
                                        debug ? console.log("Group Exists") : null;
                                        // Group with groupId exists, add the tab to the group
                                        chrome.tabs.group({
                                            tabIds: [newTab.id],
                                            groupId: newMappedGroups[tab.groupId]
                                        }, (groupId) => {
                                            debug ? console.log("Tab added to existing group", groupId) : null;
                                            resolve();
                                        });
                                    } else {
                                        debug ? console.log("Group Does Not Exists") : null;
                                        // No group with the existing id, create a new group with title and color
                                        chrome.tabs.group({
                                            createProperties: {
                                                windowId: newMappedWindows[tab.windowId]
                                            },
                                            tabIds: [newTab.id]
                                        }, (groupId) => {
                                            debug ? console.log("Tab Info", prevGroups) : null;
                                            debug ? console.log("Group Created", groupId) : null;
                                            newMappedGroups[tab.groupId] = groupId;
                                            debug ? console.log("Updating Group Info", groupId) : null;
                                            const groupInfo = {};
                                            if(tab.title) {
                                                groupInfo.title = prevGroups.find((group) => group.id === tab.groupId).title;
                                            }
                                            if(tab.color) {
                                                groupInfo.color = prevGroups.find((group) => group.id === tab.groupId).color;
                                            }
                                            if(tab.collapsed) {
                                                groupInfo.collapsed = prevGroups.find((group) => group.id === tab.groupId).collapsed;
                                            }

                                            chrome.tabGroups.update(groupId, groupInfo, (group) => {
                                                debug ? console.log("Group Updated", group) : null;
                                                resolve();
                                            });
                                        });
                                    }
                                } else {
                                    resolve();
                                }
        
                            });
                        });
        
                        if (tab.id === win.tabs[win.tabs.length - 1].id) {
                            resolveW();
                        }
                    }
                });
            }
        }
        
        await createWinTabs();
        

        debug ? console.log("Closing New Tabs") : null;
        chrome.tabs.query({ url: "chrome://newtab/" }, (tabs) => {
            debug ? console.log("Tabs", tabs) : null;
            closeTabs(tabs);
            return true;
        });

        /* setTimeout( async () => {
            await closeTabs([lastTab]);
        }, 100); */
    } catch (e) {
        debug ? console.log("Error Creating Tabs", e) : null;
        return false;
    }
}

// will work on this later
async function restoreBrowser() {
    chrome.storage.sync.get(['browserData'], function (result) {
        let browserData = result.browserData;
        let windowsData = browserData.windows;
        let groups = browserData.groups;
        for (var i = 0; i < windowsData.length; i++) {
            var win = windowsData[i];
            chrome.windows.create({ focused: win.win.focused }, function (newWin) {
                for (var j = 0; j < win.tabs.length; j++) {
                    var tab = win.tabs[j];
                    chrome.tabs.create({ windowId: newWin.id, url: tab.url, active: tab.active, pinned: tab.pinned, groupId: tab.groupId });
                }
            });
        }
    });
}


async function saveTabs(filename=null) {
    let jsonData = await gatherInfo();
    jsonData = JSON.stringify(jsonData);

    if(!filename) {
        filename = "tabs_" + new Date().getTime() + ".json";
    } else {
        filename = filename + ".json";
    }

    chrome.storage.local.get("encryption", async (data) => {
        if(data.encryption) {
            jsonData = btoa(jsonData);
        }

        chrome.downloads.download({
            url: 'data:application/json,' + encodeURIComponent(jsonData),
            filename: filename,
        }, (downloadId) => {
            console.log("downloadId", downloadId);
        });
    });
}

async function syncBrowser() {
    // sync browser data on each open or close of the tab or window
    chrome.storage.local.get("browserSync", async (data) => {
        if(data.browserSync) {
            const browserData = await gatherInfo(true);
            chrome.storage.sync.set({ browserData: browserData }, function () {
                debug ? console.log('Value is set to ', browserData) : null;
            });
        }
    });
}

async function gatherInfo(min=false) {
    return new Promise((resolve, reject) => {
        chrome.windows.getAll({ populate: true }, async function (windows) {
            let groups = await extractAllGroups();

            // minimize the data of windows which necessary
            if(min) {
                windows = windows.map((win) => {
                    let tabs = win.tabs.map((tab) => {
                        return {
                            url: tab.url,
                            active: tab.active,
                            pinned: tab.pinned,
                            groupId: tab.groupId,
                            index: tab.index,
                            selected: tab.selected,
                            status: tab.status,
                            title: tab.title
                        };
                    });
                    return {
                        id: win.id,
                        focused: win.focused,
                        incognito: win.incognito,
                        height: win.height,
                        height: win.height,
                        type: win.type,
                        top: win.top,
                        left: win.left,
                        state: win.state,
                        tabs: tabs
                    };
                });
            }

            resolve({ windows, groups });
        });
    });
}

async function extractAllGroups(){
    return new Promise((resolve, reject) => {
        chrome.tabGroups.query({}, function (groups) {
            resolve(groups);
        });
    });

}

async function closeAllExistingTabs(preventWinClose=false) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({}, (tabs) => {
            if(preventWinClose) {
                chrome.tabs.create({ url: "chrome://newtab" }, (newTab) => {
                    closeTabs(tabs).then(() => {
                        resolve(newTab);
                    });
                });
            } else {
                closeTabs(tabs).then(() => {
                    resolve();
                });
            }
        });
    });
}

async function closeTabs(tabs) {
    return new Promise((resolve, reject) => {
        tabs.forEach((tab) => {
            chrome.tabs.remove(tab.id);
        });
        resolve();
    });
}


chrome.tabs.onCreated.addListener(syncBrowser);
chrome.tabs.onUpdated.addListener(syncBrowser);
chrome.tabs.onRemoved.addListener(syncBrowser);
// chrome.windows.onCreated.addListener(syncBrowser);
// chrome.windows.onRemoved.addListener(syncBrowser);
// chrome.tabs.onActivated.addListener(syncBrowser);
// chrome.tabs.onHighlighted.addListener(syncBrowser);
// chrome.tabs.onAttached.addListener(syncBrowser);
// chrome.tabs.onDetached.addListener(syncBrowser);
// chrome.tabs.onMoved.addListener(syncBrowser);
// chrome.tabs.onReplaced.addListener(syncBrowser);
// chrome.tabs.onZoomChange.addListener(syncBrowser);