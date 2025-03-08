import Assassin from "@shared/types/class-types/Assassin";
import Ogre from "@shared/types/race-types/Ogre";
import CharacterSimulator from "@web-server/features/simulators/character/character-simulator";

describe("Verify Character Simulation Calculations", () => {
  it("Should Calculate Ogre Assassin correctly", () => {
    const ogre = Ogre.GetInstance();
    const assassin = Assassin.GetInstance();
    const racialModifier = assassin.cpRacialModifiers[ogre.name];
    const cp0 = CharacterSimulator.CalculateCp(0, racialModifier);
    const cp1 = CharacterSimulator.CalculateCp(218, racialModifier);
    const cp2 = CharacterSimulator.CalculateCp(68, racialModifier);
    const cp3 = CharacterSimulator.CalculateCp(77, racialModifier);
    const cp4 = CharacterSimulator.CalculateCp(100, racialModifier);
    const cp5 = CharacterSimulator.CalculateCp(125, racialModifier);
    expect(cp0.racialModifiedTnl).toEqual(2000);
    expect(cp1.racialModifiedTnl).toEqual(972800);
    expect(cp2.racialModifiedTnl).toEqual(5600);
    expect(cp3.racialModifiedTnl).toEqual(7400);
    expect(cp4.racialModifiedTnl).toEqual(16000);
    expect(cp5.racialModifiedTnl).toEqual(40000);
  });
});
