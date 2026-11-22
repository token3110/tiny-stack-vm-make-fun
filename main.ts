import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_MAX = 256;
const CALLS_MAX = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1000000;
const OUTPUT_MAX = 65536;

function run(program: Uint8Array, input: Uint8Array) {
  const n = program.length;
  const D = new Int32Array(STACK_MAX);
  let sp = 0;
  const C = new Int32Array(CALLS_MAX);
  let csp = 0;
  const M = new Int32Array(MEMORY_WORDS);
  const out = new Uint8Array(OUTPUT_MAX);
  let olen = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;

  const push = (v: number): number => {
    if (sp >= STACK_MAX) return 3;
    D[sp++] = v | 0;
    return 0;
  };
  const pop = (): number | null => {
    if (sp <= 0) return null;
    return D[--sp];
  };

  while (true) {
    if (steps >= STEP_LIMIT) return { stdout: out.subarray(0, olen), exit: 10 };
    steps++;
    if (pc < 0 || pc >= n) return { stdout: out.subarray(0, olen), exit: 9 };
    const op = program[pc];
    let nextPc = pc + 1;
    let trap = 0;

    if (op === 0x00) return { stdout: out.subarray(0, olen), exit: 0 }; // HALT
    if (op === 0x01) { // PUSH8
      if (pc + 1 >= n) return { stdout: out.subarray(0, olen), exit: 9 };
      const v = (program[pc + 1] << 24) >> 24;
      trap = push(v);
      nextPc = pc + 2;
    } else if (op === 0x02) { // PUSH32
      if (pc + 4 >= n) return { stdout: out.subarray(0, olen), exit: 9 };
      const v = program[pc + 1] | (program[pc + 2] << 8) | (program[pc + 3] << 16) | (program[pc + 4] << 24);
      trap = push(v);
      nextPc = pc + 5;
    } else if (op === 0x03) { // POP
      if (pop() === null) trap = 2;
    } else if (op === 0x04) { // DUP
      const a = pop();
      if (a === null) trap = 2;
      else { trap = push(a); if (!trap) trap = push(a); }
    } else if (op === 0x10) { // ADD
      const b = pop(); const a = pop();
      if (a === null || b === null) trap = 2;
      else trap = push((a + b) | 0);
    } else if (op === 0x50) { // PRINT
      const v = pop();
      if (v === null) trap = 2;
      else {
        const s = String(v);
        if (olen + s.length > OUTPUT_MAX) return { stdout: out.subarray(0, olen), exit: 11 };
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
      }
    } else if (op === 0x51) { // PUTC
      const v = pop();
      if (v === null) trap = 2;
      else if (olen >= OUTPUT_MAX) return { stdout: out.subarray(0, olen), exit: 11 };
      else out[olen++] = v & 255;
    } else if (op === 0x52) { // IN
      const b = inPos < input.length ? input[inPos++] : -1;
      trap = push(b);
    } else if (op === 0x53) { // EXIT
      const v = pop();
      if (v === null) trap = 2;
      else return { stdout: out.subarray(0, olen), exit: v & 255 };
    } else {
      trap = 5; // unknown
    }

    if (trap) return { stdout: out.subarray(0, olen), exit: trap };
    pc = nextPc;
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const prog = readFileSync(join(I, id, 'program.bin'));
  const inp = readFileSync(join(I, id, 'input.bin'));
  const res = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), res.stdout);
  writeFileSync(join(O, id, 'exit.txt'), String(res.exit) + '\n');
}
