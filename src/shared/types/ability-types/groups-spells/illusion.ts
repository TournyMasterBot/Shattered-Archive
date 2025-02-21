import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Invisibility from "@shared/types/ability-types/spells/invisibility";
import SelfProjection from "@shared/types/ability-types/spells/self-projection";
import MassInvis from "@shared/types/ability-types/spells/mass-invis";
import Ventriloquate from "@shared/types/ability-types/spells/ventriloquate";

export class Illusion implements IAbilityGroup {
  static instance: Illusion;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Illusion;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Invisibility.GetInstance().Get(),
      SelfProjection.GetInstance().Get(),
      MassInvis.GetInstance().Get(),
      Ventriloquate.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Illusion {
    if (!Illusion.instance) {
      Illusion.instance = new Illusion();
    }
    return Illusion.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Illusion.GetInstance() as T;
  }
}

export default Illusion;
