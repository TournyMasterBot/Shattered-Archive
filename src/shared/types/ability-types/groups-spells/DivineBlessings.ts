import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Nurishment from "@shared/types/ability-types/spells/Nourishment";
import MentalDrain from "@shared/types/ability-types/spells/MentalDrain";
import DivineIntervention from "@shared/types/ability-types/spells/DivineIntervention";
import HolyPresence from "@shared/types/ability-types/spells/HolyPresence";
import EnhancedRecovery from "@shared/types/ability-types/spells/EnhancedRecovery";
import BindSoul from "@shared/types/ability-types/spells/BindSoul";
import MendWounds from "@shared/types/ability-types/spells/MendWounds";
import Meteo from "@shared/types/ability-types/spells/Meteo";
import Displacement from "@shared/types/ability-types/spells/Displacement";
import Endurance from "@shared/types/ability-types/spells/Endurance";
import CureDeafness from "@shared/types/ability-types/spells/CureDeafness";
import DispelCurse from "@shared/types/ability-types/spells/DispelCurse";
import Cornucopia from "@shared/types/ability-types/spells/Cornucopia";
import FaerieFlames from "@shared/types/ability-types/spells/FaerieFlames";
import HolyFlame from "@shared/types/ability-types/spells/HolyFlame";
import ServerCache from "@shared/cache/server-cache";

export class DivineBlessings implements IAbilityGroup {
  static instance: DivineBlessings;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.DivineBlessings;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      HolyFlame.GetInstance(),
      Nurishment.GetInstance(),
      MentalDrain.GetInstance(),
      FaerieFlames.GetInstance(),
      DivineIntervention.GetInstance(),
      HolyPresence.GetInstance(),
      EnhancedRecovery.GetInstance(),
      BindSoul.GetInstance(),
      MendWounds.GetInstance(),
      Meteo.GetInstance(),
      Displacement.GetInstance(),
      Endurance.GetInstance(),
      CureDeafness.GetInstance(),
      DispelCurse.GetInstance(),
      Cornucopia.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): DivineBlessings {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DivineBlessings.GetInstance() as T;
  }
}

export default DivineBlessings;
