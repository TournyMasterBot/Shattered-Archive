import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Summon implements IAbility {
  private static instance: Summon;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Summon";
    this.helpFile = `SUMMON
Syntax: cast summon <character>
This spell summons a character from anywhere else in the world into your room.
Characters who are fighting may not be summoned.`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Summon.instance === undefined) {
      Summon.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Summon {
    if (!Summon.instance) {
      Summon.instance = new Summon();
    }
    return Summon.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Summon.GetInstance() as T;
  }
}

export default Summon;
