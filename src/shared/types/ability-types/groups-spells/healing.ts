import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CureCritical from "@shared/types/ability-types/spells/cure-critical";
import Heal from "@shared/types/ability-types/spells/heal";
import CureLight from "@shared/types/ability-types/spells/cure-light";
import MassHealing from "@shared/types/ability-types/spells/mass-healing";
import CureSerious from "@shared/types/ability-types/spells/cure-serious";
import Refresh from "@shared/types/ability-types/spells/refresh";

export class Healing implements IAbilityGroup {
  static instance: Healing;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Healing;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CureCritical.GetInstance().Get(),
      Heal.GetInstance().Get(),
      CureLight.GetInstance().Get(),
      MassHealing.GetInstance().Get(),
      CureSerious.GetInstance().Get(),
      Refresh.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Healing {
    if (!Healing.instance) {
      Healing.instance = new Healing();
    }
    return Healing.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Healing.GetInstance() as T;
  }
}

export default Healing;
