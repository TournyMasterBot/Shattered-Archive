import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import BoneBlight from "@shared/types/ability-types/spells/bone-blight";
import AnimateDead from "@shared/types/ability-types/spells/animate-dead";
import Embalm from "@shared/types/ability-types/spells/embalm";
import DeathShroud from "@shared/types/ability-types/spells/death-shroud";
import BlackCurse from "@shared/types/ability-types/spells/black-curse";
import Regenerate from "@shared/types/ability-types/spells/regenerate";
import Scourge from "@shared/types/ability-types/spells/scourge";
import FeignDeath from "@shared/types/ability-types/spells/feign-death";
import GraftFlesh from "@shared/types/ability-types/spells/graft-flesh";
import WithstandDeath from "@shared/types/ability-types/spells/withstand-death";
import SoulHarvest from "@shared/types/ability-types/spells/soul-harvest";
import Solidify from "@shared/types/ability-types/spells/solidify";
import Shadowform from "@shared/types/ability-types/spells/shadowform";
import Empath from "@shared/types/ability-types/spells/empath";
import LocateRemains from "@shared/types/ability-types/spells/locate-remains";
import CorpseHost from "@shared/types/ability-types/spells/corpse-host";
import PreventRecovery from "@shared/types/ability-types/spells/prevent-recovery";
import BodrumsBoils from "@shared/types/ability-types/spells/bodrums-boils";
import ServerCache from "@shared/cache/server-cache";

export class Necromancy implements IAbilityGroup {
  private static instance: Necromancy;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Necromancy;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      BoneBlight.GetInstance(),
      AnimateDead.GetInstance(),
      Embalm.GetInstance(),
      DeathShroud.GetInstance(),
      BlackCurse.GetInstance(),
      Regenerate.GetInstance(),
      Scourge.GetInstance(),
      FeignDeath.GetInstance(),
      GraftFlesh.GetInstance(),
      WithstandDeath.GetInstance(),
      SoulHarvest.GetInstance(),
      Solidify.GetInstance(),
      Shadowform.GetInstance(),
      Empath.GetInstance(),
      LocateRemains.GetInstance(),
      CorpseHost.GetInstance(),
      PreventRecovery.GetInstance(),
      BodrumsBoils.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Necromancy {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Necromancy.GetInstance() as T;
  }
}

export default Necromancy;
