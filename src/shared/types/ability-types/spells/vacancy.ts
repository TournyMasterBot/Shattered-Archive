import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Vacancy implements IAbility {
  private static instance: Vacancy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help Vacancy
vacancy
syntax: cast 'vacancy' <target>
The vacancy spell makes the person it's cast upon think that he or she is
all alone in the area. Unless someone is in very close proximity, they
cannot see or detect them at all.`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Vacancy.instance === undefined) {
      Vacancy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Vacancy {
    if (!Vacancy.instance) {
      Vacancy.instance = new Vacancy();
    }
    return Vacancy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Vacancy.GetInstance() as T;
  }
}

export default Vacancy;
