import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Wither implements IAbility {
  private static instance: Wither;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Wither";
    this.helpFile = `help wither
wither
Syntax: c wither
This powerful maladictive magik saps the vital spirit energy of the
target, effectively causing them to age hundreds of years in a single
moment and reducing their physical attributes to that of a doddering
old fool.`;
    this.abilityGroupType = AbilityGroupType.Unknown; // Adjust if necessary
    this.abilityUsage = AbilityUsage.Active;

    if (Wither.instance === undefined) {
      Wither.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Wither {
    if (!Wither.instance) {
      Wither.instance = new Wither();
    }
    return Wither.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Wither.GetInstance() as T;
  }
}

export default Wither;
