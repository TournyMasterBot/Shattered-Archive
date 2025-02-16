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

export class Necromancy implements IAbilityGroup {
    private static instance: Necromancy;

    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Necromancy;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            BoneBlight.GetInstance().Get(),
            AnimateDead.GetInstance().Get(),
            Embalm.GetInstance().Get(),
            DeathShroud.GetInstance().Get(),
            BlackCurse.GetInstance().Get(),
            Regenerate.GetInstance().Get(),
            Scourge.GetInstance().Get(),
            FeignDeath.GetInstance().Get(),
            GraftFlesh.GetInstance().Get(),
            WithstandDeath.GetInstance().Get(),
            SoulHarvest.GetInstance().Get(),
            Solidify.GetInstance().Get(),
            Shadowform.GetInstance().Get(),
            Empath.GetInstance().Get(),
            LocateRemains.GetInstance().Get(),
            CorpseHost.GetInstance().Get(),
            PreventRecovery.GetInstance().Get(),
            BodrumsBoils.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Necromancy {
        if (!Necromancy.instance) {
            Necromancy.instance = new Necromancy();
        }
        return Necromancy.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Necromancy.GetInstance() as T;
    }
}

export default Necromancy;
