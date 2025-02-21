import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";

export class Vampire implements IAbilityGroup {
  static instance: Vampire;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Vampire;
    this.abilityGroupType = AbilityGroupType.Specialty;
    this.abilities = [Dodge.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Vampire {
    if (!Vampire.instance) {
      Vampire.instance = new Vampire();
    }
    return Vampire.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Vampire.GetInstance() as T;
  }
}

export default Vampire;
