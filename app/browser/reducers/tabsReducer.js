/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const appConstants = require('../../../js/constants/appConstants')
const tabs = require('../tabs')
const {getWebContents} = require('../webContentsCache')
const tabState = require('../../common/state/tabState')
const windowConstants = require('../../../js/constants/windowConstants')
const windowAction = require('../../../js/actions/windowActions.js')
const {makeImmutable} = require('../../common/state/immutableUtil')
const {getFlashResourceId} = require('../../../js/flash')
const {l10nErrorText} = require('../../common/lib/httpUtil')
const windows = require('../windows')
const Immutable = require('immutable')
const dragTypes = require('../../../js/constants/dragTypes')
const {frameOptsFromFrame} = require('../../../js/state/frameStateUtil')
const {BrowserWindow} = require('electron')

const tabsReducer = (state, action) => {
  action = makeImmutable(action)
  switch (action.get('actionType')) {
    case appConstants.APP_SET_STATE:
      state = tabs.init(state, action)
      break
    case appConstants.APP_TAB_CREATED:
      state = tabState.maybeCreateTab(state, action)
      break
    case appConstants.APP_TAB_MOVED: {
      const tabId = action.get('tabId')
      const frameOpts = action.get('frameOpts')
      const browserOpts = action.get('browserOpts') || new Immutable.Map()
      const windowId = action.get('windowId') || -1
      state = tabs.moveTo(state, tabId, frameOpts, browserOpts, windowId)
      break
    }
    case appConstants.APP_CREATE_TAB_REQUESTED:
      state = tabs.createTab(state, action)
      break
    case appConstants.APP_MAYBE_CREATE_TAB_REQUESTED:
      state = tabs.maybeCreateTab(state, action)
      break
    case appConstants.APP_TAB_UPDATED:
      state = tabState.maybeCreateTab(state, action)
      break
    case appConstants.APP_ACTIVE_WEB_CONTENTS_CLOSED: {
      const tabValue = tabState.getActiveTabValue(state, BrowserWindow.getActiveWindow().id)
      if (tabValue) {
        const tabId = tabValue.get('tabId')
        if (tabs.isDevToolsFocused(tabId)) {
          state = tabs.toggleDevTools(state, tabId)
        } else {
          state = tabs.closeTab(state, tabId, false)
        }
      }
      break
    }
    case appConstants.APP_TAB_CLOSED: {
      const tabId = action.getIn(['tabValue', 'tabId'])
      const forceClose = action.get('forceClose')
      if (tabId) {
        state = tabs.closeTab(state, tabId, forceClose)
      }
      break
    }
    case appConstants.APP_ALLOW_FLASH_ONCE:
    case appConstants.APP_ALLOW_FLASH_ALWAYS:
      {
        const webContents = getWebContents(action.get('tabId'))
        if (webContents && !webContents.isDestroyed() && webContents.getURL() === action.get('url')) {
          webContents.authorizePlugin(getFlashResourceId())
        }
        break
      }
    case appConstants.APP_TAB_CLONED:
      state = tabs.clone(state, action)
      break
    case appConstants.APP_TAB_PINNED:
      state = tabs.pin(state, action)
      break
    case windowConstants.WINDOW_SET_AUDIO_MUTED:
      state = tabs.setAudioMuted(state, action)
      break
    case windowConstants.WINDOW_SET_ALL_AUDIO_MUTED:
      action.get('frameList').forEach((frameProp) => {
        state = tabs.setAudioMuted(state, frameProp)
      })
      break
    case windowConstants.WINDOW_SET_ACTIVE_FRAME:
      state = tabs.setActive(state, action)
      break
    case appConstants.APP_TAB_TOGGLE_DEV_TOOLS:
      state = tabs.toggleDevTools(state, action.get('tabId'))
      break
    case appConstants.APP_LOAD_URL_REQUESTED:
      state = tabs.loadURL(state, action)
      break
    case appConstants.APP_LOAD_URL_IN_ACTIVE_TAB_REQUESTED:
      state = tabs.loadURLInActiveTab(state, action.get('windowId'), action.get('url'))
      break
    case appConstants.APP_ON_GO_BACK:
      state = tabs.goBack(state, action)
      break
    case appConstants.APP_ON_GO_FORWARD:
      state = tabs.goForward(state, action)
      break
    case appConstants.APP_ON_GO_TO_INDEX:
      state = tabs.goToIndex(state, action)
      break
    case appConstants.APP_ON_GO_BACK_LONG:
      {
        const history = tabs.getHistoryEntries(state, action)
        const tabValue = tabState.getByTabId(state, action.get('tabId'))
        const windowId = windows.getActiveWindowId()

        if (history !== null) {
          windowAction.onLongBackHistory(
            history,
            action.getIn(['rect', 'left']),
            action.getIn(['rect', 'bottom']),
            tabValue.get('partitionNumber'),
            action.get('tabId'),
            windowId
          )
        }
        break
      }
    case appConstants.APP_ON_GO_FORWARD_LONG:
      {
        const history = tabs.getHistoryEntries(state, action)
        const tabValue = tabState.getByTabId(state, action.get('tabId'))
        const windowId = windows.getActiveWindowId()

        if (history !== null) {
          windowAction.onLongForwardHistory(
            history,
            action.getIn(['rect', 'left']),
            action.getIn(['rect', 'bottom']),
            tabValue.get('partitionNumber'),
            action.get('tabId'),
            windowId
          )
        }
        break
      }
    case appConstants.APP_FRAME_CHANGED:
      state = tabState.updateFrame(state, action)
      break
    case windowConstants.WINDOW_SET_FRAME_ERROR:
      {
        const tabId = action.getIn(['frameProps', 'tabId'])
        const tab = getWebContents(tabId)
        if (tab) {
          let currentIndex = tab.getCurrentEntryIndex()
          let previousLocation = tab.getURL()
          while (previousLocation === action.getIn(['errorDetails', 'url'])) {
            previousLocation = tab.getURLAtIndex(--currentIndex)
          }
          let tabValue = tabState.getByTabId(state, tabId)
          if (tabValue) {
            tabValue = tabValue.set('aboutDetails', makeImmutable({
              title: action.getIn(['errorDetails', 'title']) || l10nErrorText(action.getIn(['errorDetails', 'errorCode'])),
              message: action.getIn(['errorDetails', 'message']),
              previousLocation
            }).merge(action.get('errorDetails')))
            state = tabState.updateTabValue(state, tabValue)
          }
        }
      }
      break
    case appConstants.APP_DRAG_ENDED: {
      const dragData = state.get('dragData')
      if (dragData && dragData.get('type') === dragTypes.TAB) {
        const frame = dragData.get('data')
        const frameOpts = frameOptsFromFrame(frame).toJS()
        const browserOpts = { positionByMouseCursor: true }
        frameOpts.indexByFrameKey = dragData.getIn(['dragOverData', 'draggingOverKey'])
        frameOpts.prependIndexByFrameKey = dragData.getIn(['dragOverData', 'draggingOverLeftHalf'])
        state = tabs.moveTo(state, frame.get('tabId'), frameOpts, browserOpts, dragData.get('dropWindowId'))
      }
      break
    }
  }
  return state
}

module.exports = tabsReducer
