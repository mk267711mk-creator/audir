; Custom NSIS script for Audir installer

!macro customInstall
  ; Check if Node.js is installed
  ClearErrors
  nsExec::ExecToStack '"node" --version'
  Pop $0 ; exit code
  Pop $1 ; output

  ${If} $0 != 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
      "Node.js was not found on your computer.$\n$\n\
Audir requires Node.js to run.$\n$\n\
Click OK to open the Node.js download page,$\n\
or Cancel to skip (you can install it later).$\n$\n\
Please download the LTS version from https://nodejs.org" \
      IDCANCEL +2
    ExecShell "open" "https://nodejs.org/en/download"
  ${EndIf}
!macroend
