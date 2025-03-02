import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class View implements IAbility {
  private static instance: View;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = ``;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (View.instance === undefined) {
      View.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): View {
    if (!View.instance) {
      View.instance = new View();
    }
    return View.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return View.GetInstance() as T;
  }
}

export default View;
