import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ICellEditorParams } from "ag-grid-community";

const DatePickerEditor = forwardRef((props: ICellEditorParams, ref) => {
  const [value, setValue] = useState(props.value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    getValue() {
      return value;
    },
    afterGuiAttached() {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.showPicker?.();
      }
    }
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }

    return "";
  };

  const inputValue = formatDateForInput(value);

  return (
    <input
      ref={inputRef}
      type="date"
      value={inputValue}
      onChange={handleChange}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "4px 8px",
        fontSize: "14px"
      }}
    />
  );
});

DatePickerEditor.displayName = "DatePickerEditor";

export default DatePickerEditor;
