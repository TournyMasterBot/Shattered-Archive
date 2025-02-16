import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Regenerate implements IAbility {
  private static instance: Regenerate;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Regenerate";
    this.helpFile = `
            `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "This is the Conclave CSR heal spell";

    if (Regenerate.instance === undefined) {
      Regenerate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Regenerate {
    if (!Regenerate.instance) {
      Regenerate.instance = new Regenerate();
    }
    return Regenerate.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Regenerate.GetInstance() as T;
  }
}

export default Regenerate;
