import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

const DialogContext = createContext(null);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

export const DialogProvider = ({ children }) => {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    type: 'alert', // 'alert', 'confirm', 'prompt', 'scale'
    message: '',
    defaultValue: '',
    position: null, // { x, y } for overriding position
    pixelLength: null,
    resolve: null,
  });

  const [inputValue, setInputValue] = useState('');
  const [scaleError, setScaleError] = useState('');
  const inputRef = useRef(null);

  // Expose a global window object for non-React files
  useEffect(() => {
    window.appDialog = {
      showAlert: (msg, pos) => showDialog('alert', msg, '', pos),
      showConfirm: (msg, pos) => showDialog('confirm', msg, '', pos),
      showPrompt: (msg, def = '', pos) => showDialog('prompt', msg, def, pos),
      showScalePrompt: (pixelLength, pos) => showDialog('scale', '', '', pos, pixelLength)
    };
    return () => {
      delete window.appDialog;
    };
  }, []);

  useEffect(() => {
    if (dialogState.isOpen && (dialogState.type === 'prompt' || dialogState.type === 'scale') && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus();
        inputRef.current.select();
      }, 50);
    }
  }, [dialogState.isOpen, dialogState.type]);

  const showDialog = (type, message, defaultValue = '', position = null, pixelLength = null) => {
    return new Promise((resolve) => {
      setInputValue(defaultValue);
      setScaleError('');
      setDialogState({
        isOpen: true,
        type,
        message,
        defaultValue,
        position,
        pixelLength,
        resolve,
      });
    });
  };

  const closeDialog = (value = null) => {
    setDialogState((prev) => {
      if (prev.resolve) {
        prev.resolve(value);
      }
      return { ...prev, isOpen: false };
    });
    setInputValue('');
  };

  const handleScaleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    if (!val) {
      setScaleError("Length is required");
      return;
    }

    const isInteger = /^\d+$/.test(val);
    if (!isInteger) {
      setScaleError("Decimals and special characters are not allowed");
      return;
    }

    const num = parseInt(val, 10);
    if (num <= 0) {
      setScaleError("Length must be greater than 0");
      return;
    }

    setScaleError("");
  };

  const handleConfirm = () => {
    if (dialogState.type === 'scale') {
      if (scaleError || !inputValue) return;
      closeDialog(inputValue);
    } else if (dialogState.type === 'prompt') {
      closeDialog(inputValue);
    } else {
      closeDialog(true);
    }
  };

  const handleCancel = () => {
    if (dialogState.type === 'prompt' || dialogState.type === 'scale') {
      closeDialog(null);
    } else {
      closeDialog(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <DialogContext.Provider
      value={{
        showAlert: (msg, pos) => showDialog('alert', msg, '', pos),
        showConfirm: (msg, pos) => showDialog('confirm', msg, '', pos),
        showPrompt: (msg, def = '', pos) => showDialog('prompt', msg, def, pos),
        showScalePrompt: (pixelLength, pos) => showDialog('scale', '', '', pos, pixelLength),
      }}
    >
      {children}
      {dialogState.isOpen && (
        <div 
          className="custom-dialog-overlay" 
          onClick={handleCancel}
          style={{
            backgroundColor: 'transparent',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }}
        >
          <div
            className={`custom-dialog-box hud-box ${dialogState.type === 'scale' ? 'scale-dialog-box' : ''}`}
            style={
              dialogState.position
                ? {
                    position: 'absolute',
                    left: `${dialogState.position.x}px`,
                    top: `${dialogState.position.y}px`,
                    transform: 'none',
                    margin: 0
                  }
                : {}
            }
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="hud-corner top-left"></div>
            <div className="hud-corner top-right"></div>
            <div className="hud-corner bottom-left"></div>
            <div className="hud-corner bottom-right"></div>
            
            <div className="custom-dialog-header hud-header">
              {dialogState.type === 'alert' && 'SYS.MSG'}
              {dialogState.type === 'confirm' && 'CONFIRM_REQ'}
              {dialogState.type === 'prompt' && 'USER_INPUT'}
              {dialogState.type === 'scale' && '📏 Set Drawing Scale'}
            </div>
            
            <div className="custom-dialog-body">
              {dialogState.type === 'scale' ? (
                <div className="scale-dialog-content">
                  <p className="scale-description">
                    Enter the actual real-world length of the selected reference line to calibrate canvas units.
                  </p>
                  
                  <div className="scale-context-box">
                    <span className="scale-context-title">Selected Reference Line</span>
                    <div className="scale-context-row">
                      <span>Drawing Length:</span>
                      <span className="scale-context-value">{dialogState.pixelLength} px</span>
                    </div>
                  </div>
                  
                  <div className="scale-input-wrapper">
                    <label className="scale-input-label">Real Length</label>
                    <div className="scale-input-box-container">
                      <input
                        ref={inputRef}
                        type="text"
                        className={`custom-dialog-input scale-input ${scaleError ? 'error' : ''}`}
                        value={inputValue}
                        onChange={handleScaleInputChange}
                        placeholder="Example: 3500"
                      />
                      <span className="scale-input-unit">mm</span>
                    </div>
                    <span className={`scale-helper-text ${scaleError ? 'error' : ''}`}>
                      {scaleError ? `⚠️ ${scaleError}` : "Only whole numbers are supported."}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="custom-dialog-message">{dialogState.message}</p>
                  
                  {dialogState.type === 'prompt' && (
                    <input
                      ref={inputRef}
                      type="text"
                      className="custom-dialog-input panel-input"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Enter value..."
                    />
                  )}
                </>
              )}
            </div>

            <div className="custom-dialog-footer">
              {(dialogState.type === 'confirm' || dialogState.type === 'prompt' || dialogState.type === 'scale') && (
                <button className="hud-btn custom-dialog-btn cancel" onClick={handleCancel}>
                  <span className="btn-bracket">[</span> Cancel <span className="btn-bracket">]</span>
                </button>
              )}
              <button 
                className={`hud-btn custom-dialog-btn confirm ${dialogState.type === 'scale' && (scaleError || !inputValue) ? 'disabled' : ''}`} 
                onClick={handleConfirm}
                disabled={dialogState.type === 'scale' && (scaleError || !inputValue)}
              >
                <span className="btn-bracket">[</span> {dialogState.type === 'scale' ? 'Apply Scale' : 'OK'} <span className="btn-bracket">]</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
