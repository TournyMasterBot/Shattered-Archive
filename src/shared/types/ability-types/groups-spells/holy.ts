import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EmpowerWeapon from "@shared/types/ability-types/spells/EmpowerWeapon";
import DivineProtection from "@shared/types/ability-types/spells/DivineProtection";
import SummonWarhorse from "@shared/types/ability-types/spells/SummonWarhorse";
import TurnUndead from "@shared/types/ability-types/spells/TurnUndead";
import LocateEmpower from "@shared/types/ability-types/spells/LocateEmpower";
import SummonEmpyrealWarhorse from "@shared/types/ability-types/spells/SummonEmpyrealWarhorse";
import LayOnHands from "@shared/types/ability-types/spells/LayOnHands";
import RemoveEmpower from "@shared/types/ability-types/spells/RemoveEmpower";
import ServerCache from "@shared/cache/server-cache";

export class Holy implements IAbilityGroup {
  static instance: Holy;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Holy;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      EmpowerWeapon.GetInstance(),
      DivineProtection.GetInstance(),
      SummonWarhorse.GetInstance(),
      TurnUndead.GetInstance(),
      LocateEmpower.GetInstance(),
      SummonEmpyrealWarhorse.GetInstance(),
      LayOnHands.GetInstance(),
      RemoveEmpower.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Holy {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Holy.GetInstance() as T;
  }
}

export default Holy;
