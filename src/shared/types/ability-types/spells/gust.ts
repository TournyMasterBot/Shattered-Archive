import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Gust implements IAbility {
  private static instance: Gust;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Gust";
    this.helpFile = `
help wujen
Gust - Invoking a localized vortex, the Wu Jen casts a billowing wind that
kicks up a great deal of dust and debris. This dust can blind anyone in the
room not grouped with the Wu Jen, and the powerful winds can knock them off
balance.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Gust.instance === undefined) {
      Gust.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Gust {
    if (!Gust.instance) {
      Gust.instance = new Gust();
    }
    return Gust.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Gust.GetInstance() as T;
  }
}

export default Gust;
