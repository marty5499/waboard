from webbit import WebBit
import time
wbit = WebBit()

DO = [262, 100]
RE = [294, 100]
ME = [330, 100]

wbit.play(DO)
wbit.play(RE)
wbit.play(ME)

while True:
    time.sleep(0.01)
    if wbit.btnA():
        wbit.play(DO)
        wbit.showAll(0, 255, 0)

    if wbit.btnB():
        wbit.play(RE)
        wbit.showAll(255, 0, 0)

    if wbit.btnA() and wbit.btnB():
        wbit.play(ME)
        wbit.showAll(0, 0, 255)
