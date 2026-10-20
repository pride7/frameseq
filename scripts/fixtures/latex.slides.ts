presentation({ title: "LaTeX fragments" });

slide("Packages and colour");
latex`
  \usepackage{siunitx}
  \usepackage[table]{xcolor}
  \begin{tabular}{l S}
    \rowcolor{gray!15} Model & {Accuracy} \\
    Baseline & 91.2 \\
    \textcolor{red}{FrameSeq} & 94.6 \\
  \end{tabular}
`.width(640);

slide("TikZ");
latex`
  \usepackage{tikz}
  \usetikzlibrary{arrows.meta}
  \begin{tikzpicture}
    \shade[left color=red, right color=blue] (0,0) rectangle (3,1);
    \draw[-{Stealth}, thick] (0,-0.5) -- node[below] {$h_t$} (3,-0.5);
  \end{tikzpicture}
`.width(640);

latex`
  \usepackage{tikz}
  \begin{tikzpicture}
    \shade[left color=green, right color=yellow] (0,0) circle (1);
  \end{tikzpicture}
`.width(320);
