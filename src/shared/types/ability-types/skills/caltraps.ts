import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Caltraps implements IAbility {
  private static instance: Caltraps;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Caltraps";
    this.helpFile = `
CALTRAPS
CALTRAPS
Caltraps is a specialized skill learned only by assassins. The skill
consists of throwing sharp spikes to the ground at an opponent's feet.
Although the skill is not particularly damaging to the opponent, the
surprise of stepping on sharp spikes where there was only clear space
moments before does tend to make your opponent move a little more carefully,
thus making him easier to hit. Caltraps may be used during combat or as a
means of initiating combat.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Caltraps.instance === undefined) {
      Caltraps.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Caltraps {
    if (!Caltraps.instance) {
      Caltraps.instance = new Caltraps();
    }
    return Caltraps.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Caltraps.GetInstance() as T;
  }
}

export default Caltraps;
