import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Soulsight implements IAbility {
  private static instance: Soulsight;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `Syntax: c soulsight
When properly attuned to the spirit world, soulsight allows a shaman
to more clearly perceive the spirits which inhabit all things, and
the souls which inhabit material bodies. Seeing the souls of people
enables a shaman to pierce most forms of magical concealment.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Soulsight.instance === undefined) {
      Soulsight.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Soulsight {
    if (!Soulsight.instance) {
      Soulsight.instance = new Soulsight();
    }
    return Soulsight.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Soulsight.GetInstance() as T;
  }
}

export default Soulsight;
