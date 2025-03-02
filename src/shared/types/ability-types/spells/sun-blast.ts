import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SunBlast implements IAbility {
  private static instance: SunBlast;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUN BLAST

Syntax: cast 'sun blast' <target>

The Eldritch learns to channel sunlight into devastating blasts of fire
toward their enemies. While this can inflict injury onto any targeted foe,
it is more powerful against those who are sensitive to sunlight and fire.

Groups containing this spell: ELDRITCH`;
    this.manualDescription = ``; // No manual description provided
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SunBlast.instance === undefined) {
      SunBlast.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SunBlast {
    if (!SunBlast.instance) {
      SunBlast.instance = new SunBlast();
    }
    return SunBlast.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SunBlast.GetInstance() as T;
  }
}

export default SunBlast;
